import { expect, it, vi } from "vitest";
import { FilesService } from "../src/modules/files/index.js";
import type { FilesRepository } from "../src/modules/files/repository.js";
import { loadSettings } from "../src/core/config/settings.js";
import type { UnitOfWork } from "../src/core/db/unit-of-work.js";
import type { Tx, AfterCommit } from "../src/core/db/unit-of-work.js";
import type { Storage } from "../src/core/storage/client.js";
import type { Principal } from "../src/core/security/principal.js";
import { ApiError } from "../src/core/jsonapi/errors.js";
import { canView, canEdit, seesDrafts, canTransition } from "../src/modules/posts/policies.js";
import { PostEvents } from "../src/modules/posts/events.js";
import { PostResource } from "../src/modules/posts/index.js";
import { EVENTS } from "../src/modules/registry.js";
import { RecordingRealtimePublisher } from "../src/core/realtime/publisher.js";
const actor: Principal = {
  userId: "01900000-0000-7000-8000-000000000001",
  sessionId: "01900000-0000-7000-8000-000000000002",
  sessionCreatedAt: new Date(),
  permissions: new Set(["posts:create"]),
};
it("keeps policy visibility, edit permission and the explicit two-way transition table", () => {
  const draft = { authorId: actor.userId, status: "draft" },
    publicPost = { authorId: "other", status: "published" };
  expect(canView(draft, null)).toBe(false);
  expect(canView(draft, actor)).toBe(true);
  expect(canEdit(publicPost, actor)).toBe(false);
  expect(canView(publicPost, actor)).toBe(true);
  const manager = { ...actor, permissions: new Set(["posts:manage"] as const) };
  expect(canView({ ...draft, authorId: "other" }, manager)).toBe(true);
  expect(seesDrafts(actor, undefined)).toBe(false);
  expect(seesDrafts(actor, actor.userId)).toBe(true);
  expect(canTransition("draft", "published")).toBe(true);
  expect(canTransition("published", "draft")).toBe(true);
  expect(canTransition("published", "published")).toBe(true);
  expect(canTransition("draft", "archived")).toBe(false);
});
it("validates size then type before quota; unit doubles never count as real quota acceptance", async () => {
  const order: string[] = [],
    tx = {} as Tx;
  const repository = {
    lockOwner: () => {
      order.push("lock");
      return Promise.resolve();
    },
    used: () => {
      order.push("sum");
      return Promise.resolve(100n);
    },
  } as unknown as FilesRepository;
  const uow = {
    run: (fn: (tx: Tx) => Promise<unknown>) => {
      order.push("transaction");
      return fn(tx);
    },
  } as unknown as UnitOfWork;
  const files = new FilesService(
    repository,
    uow,
    {} as Storage,
    loadSettings({ FILE_MAX_SIZE: "50", FILE_USER_QUOTA: "100" }),
  );
  const huge = await files
    .create(actor, { filename: "x", contentType: "application/pdf", size: 9007199254740992 })
    .catch((e: unknown) => e);
  expect(huge).toBeInstanceOf(ApiError);
  expect((huge as ApiError).toObject()).toMatchObject({
    code: "file.too_large",
    meta: { params: { max: 50 } },
  });
  expect(order).toEqual([]);
  const type = await files
    .create(actor, { filename: "x", contentType: "application/pdf", size: 1 })
    .catch((e: unknown) => e);
  expect((type as ApiError).code).toBe("file.type_not_allowed");
  expect(order).toEqual([]);
  const quota = await files
    .create(actor, { filename: "x", contentType: "image/png", size: 1 })
    .catch((e: unknown) => e);
  expect((quota as ApiError).toObject()).toMatchObject({
    code: "file.quota_exceeded",
    source: { pointer: "/data/attributes/size" },
    meta: { params: { quota: 100 } },
  });
  expect(order).toEqual(["transaction", "lock", "sum"]);
});
it("runs event payload functions only in commit hooks and never builds empty-room payloads", async () => {
  const publisher = new RecordingRealtimePublisher(),
    hooks: (() => unknown)[] = [],
    afterCommit: AfterCommit = (hook) => {
      hooks.push(hook);
    };
  const events = new PostEvents(publisher);
  events.register(EVENTS.filter((e) => e.name.startsWith("post.")));
  const post = PostResource.parse({
    type: "posts",
    id: "post",
    attributes: {
      title: "Title",
      body: "Body",
      status: "draft",
      publishedAt: null,
      createdAt: "2026-10-12T00:00:00Z",
      updatedAt: "2026-10-12T00:00:00Z",
    },
    relationships: {
      author: { data: { type: "users", id: actor.userId } },
      coverImage: { data: null },
    },
  });
  events.created(afterCommit, post);
  expect(publisher.events).toEqual([]);
  for (const hook of hooks) await hook();
  expect(publisher.events[0]?.rooms).toEqual(["posts:all", `user:${actor.userId}`]);
  const build = vi.fn(() => ({ forbidden: "draft" }));
  publisher.queue(afterCommit, "unused", [], build);
  expect(build).not.toHaveBeenCalled();
  expect(hooks).toHaveLength(1);
  const committed = vi.fn(() => ({ ok: true }));
  publisher.queue(afterCommit, "probe", ["one", "one"], committed);
  expect(committed).not.toHaveBeenCalled();
  await hooks[1]?.();
  expect(committed).toHaveBeenCalledOnce();
  expect(publisher.events[1]?.rooms).toEqual(["one"]);
});
it("treats malformed or empty attachment IDs as missing before sending UUID input to Prisma", async () => {
  const get = vi.fn();
  const files = new FilesService(
    { get } as unknown as FilesRepository,
    {} as UnitOfWork,
    {} as Storage,
    loadSettings({}),
  );
  for (const id of ["", "not-a-uuid"]) {
    const error = await files
      .attachableFile({} as Tx, actor, id, "/data/relationships/coverImage/data")
      .catch((e: unknown) => e);
    expect((error as ApiError).toObject()).toMatchObject({
      status: "404",
      code: "resource.not_found",
      source: { pointer: "/data/relationships/coverImage/data" },
    });
  }
  expect(get).not.toHaveBeenCalled();
});
