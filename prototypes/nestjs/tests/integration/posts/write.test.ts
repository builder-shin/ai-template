import { expect, it, vi } from "vitest";
import { api, db } from "../helpers.js";
import {
  domainSuite,
  actor,
  createPost,
  changePost,
  postData,
  uploaded,
  app,
} from "../domain-helpers.js";
import { PostsService } from "../../../src/modules/posts/index.js";
import { Storage } from "../../../src/core/storage/client.js";
import { UnitOfWork } from "../../../src/core/db/unit-of-work.js";
import { FilesService } from "../../../src/modules/files/index.js";
import { RecordingRealtimePublisher } from "../../../src/core/realtime/publisher.js";
import { FileDocument } from "../../../src/modules/files/index.js";
import { createFile } from "../domain-helpers.js";
domainSuite("posts-write");
it("applies transitions and published/wasPublished rooms only after actual commits", async () => {
  const owner = await actor(),
    publisher = app.get(RecordingRealtimePublisher);
  const draft = postData(await createPost(owner.authorization));
  expect(publisher.events.map((e) => [e.name, e.rooms])).toEqual([
    ["post.created", ["posts:all", `user:${owner.user.id}`]],
  ]);
  publisher.events.length = 0;
  const published = postData(
    await changePost(owner.authorization, draft.id, { status: "published" }),
  );
  expect(published.attributes.publishedAt).not.toBeNull();
  expect(publisher.events.map((e) => [e.name, e.rooms])).toEqual([
    ["post.published", ["posts", "posts:all", `user:${owner.user.id}`]],
  ]);
  publisher.events.length = 0;
  const same = postData(await changePost(owner.authorization, draft.id, { status: "published" }));
  expect(same.attributes.publishedAt).toBe(published.attributes.publishedAt);
  expect(publisher.events.map((e) => [e.name, e.rooms])).toEqual([
    ["post.updated", ["posts:all", `user:${owner.user.id}`, "posts"]],
  ]);
  publisher.events.length = 0;
  const withdrawn = postData(await changePost(owner.authorization, draft.id, { status: "draft" }));
  expect(withdrawn.attributes.publishedAt).toBeNull();
  expect(publisher.events.map((e) => [e.name, e.rooms])).toEqual([
    ["post.updated", ["posts:all", `user:${owner.user.id}`]],
    ["post.unpublished", ["posts"]],
  ]);
  expect(publisher.events[1]?.payload).toEqual({ data: { type: "posts", id: draft.id } });
  publisher.events.length = 0;
  expect(
    (await api().delete(`/api/v1/posts/${draft.id}`).set("Authorization", owner.authorization))
      .status,
  ).toBe(204);
  expect(publisher.events[0]?.rooms).toEqual(["posts:all", `user:${owner.user.id}`]);
  const publicPost = postData(
    await createPost(owner.authorization, { title: "Public", body: "Body", status: "published" }),
  );
  expect(publisher.events.slice(-2).map((e) => e.name)).toEqual(["post.created", "post.published"]);
  expect(
    (await api().delete(`/api/v1/posts/${publicPost.id}`).set("Authorization", owner.authorization))
      .status,
  ).toBe(204);
  expect(publisher.events.at(-1)?.rooms).toEqual(["posts:all", `user:${owner.user.id}`, "posts"]);
  console.log(
    JSON.stringify({
      postEventRooms: publisher.events.map(({ name, rooms }) => ({ name, rooms })),
    }),
  );
});
it("commits manager deletion and its audit atomically, and contains rollback events", async () => {
  const owner = await actor(),
    manager = await actor("manager@example.com", true);
  const post = postData(
    await createPost(owner.authorization, { title: "Foreign", body: "Body", status: "published" }),
  );
  const publisher = app.get(RecordingRealtimePublisher);
  publisher.events.length = 0;
  const audit = await db.auditLog.count({ where: { action: "post.deleted_by_admin" } });
  expect(audit).toBe(0);
  expect(
    (await api().delete(`/api/v1/posts/${post.id}`).set("Authorization", manager.authorization))
      .status,
  ).toBe(204);
  expect(await db.post.findUnique({ where: { id: post.id } })).toBeNull();
  const entry = await db.auditLog.findFirstOrThrow({ where: { action: "post.deleted_by_admin" } });
  expect(entry).toMatchObject({
    actorId: manager.user.id,
    targetId: post.id,
    targetType: "posts",
    metadata: { author: owner.user.id },
  });
  const before = publisher.events.length;
  await expect(
    app.get(UnitOfWork).run(async (tx, afterCommit) => {
      await tx.role.create({ data: { name: "abort-event" } });
      publisher.queue(afterCommit, "post.updated", ["posts"], () => ({ secret: "draft" }));
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(publisher.events).toHaveLength(before);
  await app.get(UnitOfWork).run(async (_tx, afterCommit) => {
    publisher.queue(afterCommit, "unused", [], () => {
      throw new Error("empty rooms built a payload");
    });
    await Promise.resolve();
  });
  expect(publisher.events).toHaveLength(before);
});
it("checks ready owned cover attachments and releases rows in transaction then objects after commit, preserving references", async () => {
  const owner = await actor(),
    other = await actor("other@example.com"),
    storage = app.get(Storage);
  const old = await uploaded(owner.authorization),
    next = await uploaded(owner.authorization),
    foreign = await uploaded(other.authorization);
  const post = postData(
    await createPost(owner.authorization, { title: "Cover", body: "Body" }, old.id),
  );
  const blocked = await changePost(owner.authorization, post.id, {}, foreign.id);
  expect(blocked.status).toBe(404);
  expect(blocked.body).toMatchObject({
    errors: [{ source: { pointer: "/data/relationships/coverImage/data" } }],
  });
  for (const id of ["", "not-a-uuid"]) {
    const missing = await changePost(owner.authorization, post.id, {}, id);
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({
      errors: [
        { code: "resource.not_found", source: { pointer: "/data/relationships/coverImage/data" } },
      ],
    });
  }
  const pending = FileDocument.parse((await createFile(owner.authorization)).body).data;
  expect((await changePost(owner.authorization, post.id, {}, pending.id)).status).toBe(422);
  const observation: { rowAbsent: boolean; objectSize: number | null }[] = [];
  const originalDelete = storage.delete.bind(storage);
  const deletion = vi.spyOn(storage, "delete").mockImplementation(async (key) => {
    observation.push({
      rowAbsent: (await db.file.findUnique({ where: { id: key.slice(6) } })) === null,
      objectSize: await storage.size(key),
    });
    await originalDelete(key);
  });
  try {
    expect((await changePost(owner.authorization, post.id, {}, next.id)).status).toBe(200);
    expect(observation).toEqual([{ rowAbsent: true, objectSize: 4 }]);
    expect(await storage.size(`files/${old.id}`)).toBeNull();
    const shared = postData(
      await createPost(owner.authorization, { title: "Shared", body: "Body" }, next.id),
    );
    expect((await changePost(owner.authorization, post.id, {}, null)).status).toBe(200);
    expect(await db.file.findUnique({ where: { id: next.id } })).not.toBeNull();
    await db.user.update({ where: { id: owner.user.id }, data: { avatarId: next.id } });
    expect(
      (await api().delete(`/api/v1/posts/${shared.id}`).set("Authorization", owner.authorization))
        .status,
    ).toBe(204);
    expect(await db.file.findUnique({ where: { id: next.id } })).not.toBeNull();
    const me = await api()
      .get("/api/v1/me?include=avatar")
      .set("Authorization", owner.authorization);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      data: { relationships: { avatar: { data: { type: "files", id: next.id } } } },
      included: [
        {
          type: "files",
          attributes: { filename: "x.png" },
        },
      ],
    });
    const avatarFile = FileDocument.parse({
      data: (me.body as { included: unknown[] }).included[0],
    }).data;
    const avatarUrl = avatarFile.meta?.downloadUrl;
    if (!avatarUrl) throw new Error("Missing included avatar download URL.");
    const signed = new URL(avatarUrl);
    expect(signed.origin).toBe(new URL(storage.settings.S3_PUBLIC_ENDPOINT_URL).origin);
    expect(signed.pathname).toBe(
      `/${storage.settings.S3_BUCKET}/${storage.key(`files/${next.id}`)}`,
    );
    expect(signed.searchParams.get("X-Amz-Expires")).toBe("600");
    const bytes = await fetch(avatarUrl);
    expect(bytes.ok).toBe(true);
    expect(Buffer.from(await bytes.arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4]));
    expect((await api().get(`/api/v1/files/${next.id}`)).status).toBe(404);
    await db.user.update({ where: { id: owner.user.id }, data: { avatarId: null } });
    await expect(
      app.get(UnitOfWork).run(async (tx, afterCommit) => {
        await app.get(FilesService).release(tx, afterCommit, [next.id]);
        throw new Error("rollback release");
      }),
    ).rejects.toThrow("rollback release");
    expect(await db.file.findUnique({ where: { id: next.id } })).not.toBeNull();
    expect(await storage.size(`files/${next.id}`)).toBe(4);
    await app
      .get(UnitOfWork)
      .run((tx, afterCommit) => app.get(FilesService).release(tx, afterCommit, [next.id]));
    expect(observation.at(-1)).toEqual({ rowAbsent: true, objectSize: 4 });
    expect(await storage.size(`files/${next.id}`)).toBeNull();
  } finally {
    deletion.mockRestore();
  }
});
it("seeds exactly two published examples and one draft idempotently", async () => {
  const owner = await actor(),
    posts = app.get(PostsService);
  await app.get(UnitOfWork).run((tx) => posts.ensureExamples(tx, owner.user.id));
  await app.get(UnitOfWork).run((tx) => posts.ensureExamples(tx, owner.user.id));
  const rows = await db.post.findMany();
  expect(rows).toHaveLength(3);
  expect(rows.filter((p) => p.status === "published")).toHaveLength(2);
  expect(rows.filter((p) => p.status === "draft")).toHaveLength(1);
});
