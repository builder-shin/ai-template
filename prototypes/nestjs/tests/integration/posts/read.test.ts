import { expect, it } from "vitest";
import { api, codes, db } from "../helpers.js";
import {
  domainSuite,
  actor,
  createPost,
  changePost,
  postData,
  uploaded,
  app,
} from "../domain-helpers.js";
import {
  PostCollectionDocument,
  PostDocument,
  PostsService,
} from "../../../src/modules/posts/index.js";
import { RolesService } from "../../../src/modules/roles/index.js";
import { UnitOfWork } from "../../../src/core/db/unit-of-work.js";
import { FileDocument } from "../../../src/modules/files/index.js";
import { UserMeDocument } from "../../../src/modules/users/index.js";
domainSuite("posts-read");
it("follows draft visibility, own-author filters, manager filters and 404/403 writes", async () => {
  const owner = await actor(),
    other = await actor("other@example.com"),
    manager = await actor("manager@example.com", true);
  const draft = postData(await createPost(owner.authorization));
  const published = postData(
    await createPost(owner.authorization, {
      title: "Published",
      body: "Body",
      status: "published",
    }),
  );
  for (const authorization of [undefined, other.authorization]) {
    const get = api().get(`/api/v1/posts/${draft.id}`);
    if (authorization) get.set("Authorization", authorization);
    expect((await get).status).toBe(404);
  }
  expect(
    (await api().get(`/api/v1/posts/${draft.id}`).set("Authorization", owner.authorization)).status,
  ).toBe(200);
  expect(
    (await api().get(`/api/v1/posts/${draft.id}`).set("Authorization", manager.authorization))
      .status,
  ).toBe(200);
  for (const [authorization, count] of [
    [undefined, 1],
    [other.authorization, 1],
    [owner.authorization, 2],
    [manager.authorization, 2],
  ] as const) {
    const get = api().get(`/api/v1/posts?filter[author]=${owner.user.id}`);
    if (authorization) get.set("Authorization", authorization);
    const r = await get;
    expect(r.status).toBe(200);
    expect(PostCollectionDocument.parse(r.body).data).toHaveLength(count);
  }
  const general = await api().get("/api/v1/posts").set("Authorization", owner.authorization);
  expect(PostCollectionDocument.parse(general.body).data).toHaveLength(1);
  const hidden = await api().get(
    `/api/v1/posts?filter[status]=draft&filter[author]=${owner.user.id}`,
  );
  expect(PostCollectionDocument.parse(hidden.body).data).toEqual([]);
  const managed = await api()
    .get("/api/v1/posts?filter[status]=draft")
    .set("Authorization", manager.authorization);
  expect(PostCollectionDocument.parse(managed.body).data.map((p) => p.id)).toEqual([draft.id]);
  expect((await changePost(other.authorization, published.id, { title: "Denied" })).status).toBe(
    403,
  );
  expect((await changePost(other.authorization, draft.id, { title: "Hidden" })).status).toBe(404);
  expect((await changePost(manager.authorization, draft.id, { title: "Managed" })).status).toBe(
    200,
  );
});
it("searches literal substrings, orders with actual PostgreSQL collation and builds page links", async () => {
  const owner = await actor();
  for (const title of ["체리", "사과", "바나나"])
    postData(await createPost(owner.authorization, { title, body: "과일", status: "published" }));
  postData(
    await createPost(owner.authorization, { title: "당근", body: "채소", status: "published" }),
  );
  postData(
    await createPost(owner.authorization, {
      title: "literal%_\\value",
      body: "literal",
      status: "published",
    }),
  );
  const page = await api().get(
    `/api/v1/posts?filter[author]=${owner.user.id}&filter[q]=${encodeURIComponent("과일")}&sort=title&page[size]=2`,
  );
  expect(page.status).toBe(200);
  const doc = PostCollectionDocument.parse(page.body);
  const expected = await db.post.findMany({
    where: { body: "과일" },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    take: 2,
  });
  expect(doc.data.map((p) => p.attributes.title)).toEqual(expected.map((p) => p.title));
  expect(doc.meta.page).toEqual({ number: 1, size: 2, total: 3, totalPages: 2 });
  expect(doc.links.next).not.toBeNull();
  const next = await api().get(doc.links.next ?? "");
  expect(PostCollectionDocument.parse(next.body).data).toHaveLength(1);
  for (const q of ["%", "_", "\\"]) {
    const found = await api().get(`/api/v1/posts?filter[q]=${encodeURIComponent(q)}`);
    expect(PostCollectionDocument.parse(found.body).data.map((p) => p.attributes.title)).toEqual([
      "literal%_\\value",
    ]);
  }
  const [collation] = await db.$queryRaw<
    { collate: string; ctype: string; provider: string }[]
  >`SELECT datcollate::text AS collate, datctype::text AS ctype, datlocprovider::text AS provider FROM pg_database WHERE datname = current_database()`;
  console.log(JSON.stringify({ koreanTitleOrdering: expected.map((p) => p.title), collation }));
});
it("loads deduplicated author/cover includes with only public author attributes and sparse fields", async () => {
  const owner = await actor(),
    file = await uploaded(owner.authorization);
  const post = postData(
    await createPost(
      owner.authorization,
      { title: "Cover", body: "Body", status: "published" },
      file.id,
    ),
  );
  const response = await api().get(`/api/v1/posts/${post.id}?include=author,coverImage,author`);
  expect(response.status).toBe(200);
  const doc = PostDocument.parse(response.body);
  expect(doc.included).toHaveLength(2);
  const user = doc.included?.find((r) => r.type === "users");
  expect(user?.attributes).toEqual({ name: "Alice" });
  expect(JSON.stringify(user)).not.toContain("email");
  const included = doc.included?.find((r) => r.type === "files");
  const ready = FileDocument.parse({ data: included }).data;
  expect(ready.meta?.downloadUrl).toBeDefined();
  const sparse = await api().get(
    `/api/v1/posts/${post.id}?include=author,coverImage&fields[posts]=title&fields[users]=name&fields[files]=filename`,
  );
  expect(sparse.body).toMatchObject({
    data: { attributes: { title: "Cover" }, relationships: {} },
    included: [
      { type: "users", attributes: { name: "Alice" } },
      {
        type: "files",
        attributes: { filename: "x.png" },
      },
    ],
  });
  const s = sparse.body as { data: { attributes: object }; included: { attributes: object }[] };
  expect(Object.keys(s.data.attributes)).toEqual(["title"]);
  expect(Object.keys(s.included[1]?.attributes ?? {})).toEqual(["filename"]);
});
it("enforces posts:create and keeps Unicode supplementary code-point100000/100001 boundaries", async () => {
  expect((await createPost("", { title: "Anonymous", body: "Body" })).status).toBe(401);
  const owner = await actor();
  const where = { userId: owner.user.id };
  expect(await db.userRole.count({ where })).toBe(1);
  // Role assignment is additive; remove this actor's memberships to exercise permission denial.
  const removed = await app.get(UnitOfWork).run((tx) => tx.userRole.deleteMany({ where }));
  expect(removed.count).toBe(1);
  expect(await db.userRole.findMany({ where })).toEqual([]);
  const withoutRoles = await api()
    .get("/api/v1/me?include=roles")
    .set("Authorization", owner.authorization);
  expect(withoutRoles.status).toBe(200);
  const withoutRolesDocument = UserMeDocument.parse(withoutRoles.body);
  expect(withoutRolesDocument.data.relationships.roles.data).toEqual([]);
  expect(withoutRolesDocument.included).toEqual([]);
  expect(withoutRolesDocument.meta.permissions).toEqual([]);
  const denied = await createPost(owner.authorization);
  expect(denied.status).toBe(403);
  expect(codes(denied)).toEqual(["permission.denied"]);
  await app
    .get(UnitOfWork)
    .run((tx) => app.get(RolesService).assign(tx, owner.user.id, ["member"]));
  const restoredRoles = await db.userRole.findMany({ where, include: { role: true } });
  expect(restoredRoles.map((membership) => membership.role.name)).toEqual(["member"]);
  const restored = await api()
    .get("/api/v1/me?include=roles")
    .set("Authorization", owner.authorization);
  expect(restored.status).toBe(200);
  const restoredDocument = UserMeDocument.parse(restored.body);
  expect(restoredDocument.data.relationships.roles.data).toEqual(
    restoredRoles.map((membership) => ({ type: "roles", id: membership.roleId })),
  );
  expect(restoredDocument.meta.permissions).toEqual(["posts:create"]);
  const created = await createPost(owner.authorization, {
    title: "Supplementary",
    body: "\u{10400}".repeat(100_000),
  });
  expect(created.status).toBe(201);
  const longest = postData(created);
  expect(Array.from(longest.attributes.body)).toHaveLength(100_000);
  expect(longest.attributes.body.length).toBe(200_000);
  const oversized = await createPost(owner.authorization, {
    title: "Too long",
    body: "\u{10400}".repeat(100_001),
  });
  expect(oversized.status).toBe(422);
  expect(oversized.body).toMatchObject({
    errors: [
      {
        code: "validation.too_long",
        source: { pointer: "/data/attributes/body" },
        meta: { params: { max: 100_000 } },
      },
    ],
  });
  await app.get(UnitOfWork).run((tx) => app.get(PostsService).ensureExamples(tx, owner.user.id));
  expect(await db.post.count()).toBe(1);
});
