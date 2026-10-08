/**
 * 글 쓰기: 만들기(초안이 기본), 발행과 취소(publishedAt), 전이 표, updatedAt, 커버 이미지, 지우기와 감사,
 * 권한 매트릭스. FastAPI 템플릿의 posts/tests/test_write.py와 test_permissions.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { ApiError, type ErrorObject } from "../src/jsonapi/errors.ts";
import { canTransition, type Transition } from "../src/modules/posts/policies.ts";
import { requireTransition } from "../src/modules/posts/service.ts";
import { newAccount, newUser, send, type SignedIn, signIn, userWith } from "./accounts.ts";
import {
  COVER_POINTER,
  coverRelationship,
  createDocument,
  patchPost,
  POSTS,
  type PostDocument,
  updateDocument,
  writePost,
} from "./posts.ts";
import { codesOf, errorsOf, TIMESTAMP, testApp } from "./support.ts";
import { FILES, uploadFile } from "./uploads.ts";

type App = ReturnType<typeof testApp>["app"];

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function patched(app: App, user: SignedIn, postId: string, data: Record<string, unknown>) {
  const response = await patchPost(app, user, postId, data);
  expect(response.status, await response.clone().text()).toBe(200);
  return ((await response.json()) as PostDocument).data;
}

function problems(errors: readonly ErrorObject[]): unknown[] {
  return errors.map((error) => [error.code, error.source]);
}

describe("만들기", () => {
  it("새 글은 내가 쓴 초안이고, 응답에는 포함 리소스가 없다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const response = await send(app, "POST", POSTS, {
      document: createDocument(),
      token: user.accessToken,
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as PostDocument;
    expect(body).toEqual({
      data: {
        type: "posts",
        id: expect.stringMatching(UUID7) as unknown,
        attributes: {
          title: "첫 글",
          body: "# 안녕",
          status: "draft",
          publishedAt: null,
          createdAt: expect.stringMatching(TIMESTAMP) as unknown,
          updatedAt: body.data.attributes.createdAt,
        },
        relationships: {
          author: { data: { type: "users", id: user.userId } },
          coverImage: { data: null },
        },
      },
    });
    expect(state.store.posts.get(body.data.id)?.authorId).toBe(user.userId);
  });

  it("발행 상태로 만들면 publishedAt을 채운다", async () => {
    const { app, state } = testApp();
    const post = await writePost(app, await newUser(app, state), { status: "published" });
    expect(post.attributes.publishedAt).toBe(post.attributes.createdAt);
  });

  it("본문은 100,000자까지이고, 넘으면 422 validation.too_long이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const longest = await writePost(app, user, { body: "가".repeat(100_000) });
    expect(longest.attributes.body).toHaveLength(100_000);
    const document = createDocument({ body: "가".repeat(100_001) });
    const response = await send(app, "POST", POSTS, { document, token: user.accessToken });
    expect(problems(await errorsOf(response, 422))).toEqual([
      ["validation.too_long", { pointer: "/data/attributes/body" }],
    ]);
  });

  it("로그인하지 않으면 401, posts:create가 없으면 403이다", async () => {
    const { app, state } = testApp();
    const anonymous = await send(app, "POST", POSTS, { document: createDocument() });
    expect(await codesOf(anonymous, 401)).toEqual(["auth.unauthenticated"]);
    const email = newAccount(state, { roleNames: [] }).email ?? "";
    const bare = await signIn(app, email);
    const denied = await send(app, "POST", POSTS, {
      document: createDocument(),
      token: bare.accessToken,
    });
    expect((await errorsOf(denied, 403)).map((error) => error.detail)).toEqual([
      "Permission posts:create is required.",
    ]);
  });
});

describe("발행과 전이", () => {
  it("발행하면 publishedAt을 채우고, 발행한 채로 고치면 그대로, 취소하면 null이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const post = await writePost(app, user, { status: "published" });
    const publishedAt = post.attributes.publishedAt;
    const same = await patched(app, user, post.id, {
      attributes: { status: "published", title: "고친 제목" },
    });
    expect([same.attributes.title, same.attributes.publishedAt]).toEqual([
      "고친 제목",
      publishedAt,
    ]);
    const draft = await patched(app, user, post.id, { attributes: { status: "draft" } });
    expect(draft.attributes.publishedAt).toBeNull();
    const again = await patched(app, user, post.id, { attributes: { status: "published" } });
    expect(again.attributes.publishedAt).toBe(again.attributes.updatedAt);
  });

  it("전이 표에 없는 전이는 422 post.invalid_transition이다", () => {
    for (const [from, to] of [
      ["draft", "draft"],
      ["draft", "published"],
      ["published", "draft"],
      ["published", "published"],
    ] as const) {
      expect(canTransition(from, to)).toBe(true);
    }
    const publishOnly: readonly Transition[] = [["draft", "published"]];
    expect(canTransition("published", "published", publishOnly)).toBe(true);
    let refused: unknown;
    try {
      requireTransition("published", "draft", publishOnly);
    } catch (error) {
      refused = error;
    }
    expect(refused instanceof ApiError ? refused.toErrorObject() : refused).toEqual({
      status: "422",
      code: "post.invalid_transition",
      title: "Unprocessable Content",
      detail: "A post cannot go from published to draft.",
      source: { pointer: "/data/attributes/status" },
    });
  });

  it("값이 바뀐 것이 있을 때만 updatedAt을 바꾼다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const post = await writePost(app, user, { title: "제목" });
    const untouched = [
      {},
      { attributes: {} },
      { attributes: { title: "제목", status: "draft" } },
      { relationships: coverRelationship(null) },
    ];
    for (const data of untouched) {
      const same = await patched(app, user, post.id, data);
      expect(same.attributes.updatedAt).toBe(post.attributes.updatedAt);
    }
    const renamed = await patched(app, user, post.id, { attributes: { title: "새 제목" } });
    expect(renamed.attributes.updatedAt > post.attributes.updatedAt).toBe(true);
    expect(renamed.attributes.createdAt).toBe(post.attributes.createdAt);
  });

  it("data.id가 경로와 다르면 409이고, 그다음 남의 글은 403, 남의 초안은 404다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const other = await newUser(app, state);
    const post = await writePost(app, author, { status: "published" });
    const draft = await writePost(app, author);
    const mismatched = await send(app, "PATCH", `${POSTS}/${post.id}`, {
      document: { data: { type: "posts", id: draft.id, attributes: { title: "다른 글" } } },
      token: other.accessToken,
    });
    expect(problems(await errorsOf(mismatched, 409))).toEqual([
      ["resource.conflict", { pointer: "/data/id" }],
    ]);
    const blocked = await patchPost(app, other, post.id, { attributes: { title: "바꿈" } });
    expect((await errorsOf(blocked, 403)).map((error) => error.detail)).toEqual([
      "Only the author or someone with posts:manage can change it.",
    ]);
    const hidden = await patchPost(app, other, draft.id, { attributes: { title: "바꿈" } });
    expect(await codesOf(hidden, 404)).toEqual(["resource.not_found"]);
  });
});

describe("커버 이미지", () => {
  it("커버는 내가 올린 ready 이미지이고, null로 뺀다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    const post = await writePost(app, user, {}, image.id);
    expect(post.relationships.coverImage.data).toEqual({ type: "files", id: image.id });
    const others = await uploadFile(app, await newUser(app, state));
    const pending = await uploadFile(app, user, { ready: false });
    for (const [fileId, status, code] of [
      [others.id, 404, "resource.not_found"],
      [pending.id, 422, "file.upload_incomplete"],
    ] as const) {
      const document = createDocument({}, fileId);
      const response = await send(app, "POST", POSTS, { document, token: user.accessToken });
      expect(problems(await errorsOf(response, status))).toEqual([
        [code, { pointer: COVER_POINTER }],
      ]);
    }
    const removed = await patched(app, user, post.id, { relationships: coverRelationship(null) });
    expect(removed.relationships.coverImage).toEqual({ data: null });
  });

  it("커버가 틀리면 다른 값도 바꾸지 않는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const post = await writePost(app, user, { title: "그대로" });
    const pending = await uploadFile(app, user, { ready: false });
    const response = await patchPost(app, user, post.id, {
      attributes: { title: "바뀌면 안 된다", status: "published" },
      relationships: coverRelationship(pending.id),
    });
    expect(await codesOf(response, 422)).toEqual(["file.upload_incomplete"]);
    expect(state.store.posts.get(post.id)).toMatchObject({ title: "그대로", status: "draft" });
  });

  it("바꾸거나 뺀 커버는 다른 리소스가 가리키지 않으면 지운다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const first = await uploadFile(app, user);
    const second = await uploadFile(app, user);
    const post = await writePost(app, user, {}, first.id);
    for (const cover of [second.id, null]) {
      await patched(app, user, post.id, { relationships: coverRelationship(cover) });
    }
    for (const image of [first, second]) {
      expect(state.storage.size(`files/${image.id}`)).toBeUndefined();
      const gone = await send(app, "GET", `${FILES}/${image.id}`, { token: user.accessToken });
      expect(gone.status).toBe(404);
    }
  });

  it("내 아바타이기도 한 커버는 글을 지워도 남는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    const avatar = { avatar: { data: { type: "files", id: image.id } } };
    const me = { data: { type: "users", id: user.userId, relationships: avatar } };
    const changed = await send(app, "PATCH", "/api/v1/me", {
      document: me,
      token: user.accessToken,
    });
    expect(changed.status).toBe(200);
    const post = await writePost(app, user, {}, image.id);
    const path = `${POSTS}/${post.id}`;
    expect((await send(app, "DELETE", path, { token: user.accessToken })).status).toBe(204);
    const kept = await send(app, "GET", `${FILES}/${image.id}`, { token: user.accessToken });
    expect(kept.status).toBe(200);
  });

  it("작성자가 탈퇴해도 커버는 남고, 글을 지우면 함께 지운다", async () => {
    const { app, state, config } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    const post = await writePost(app, user, { status: "published" }, image.id);
    expect((await send(app, "DELETE", "/api/v1/me", { token: user.accessToken })).status).toBe(204);
    const read = await send(app, "GET", `${POSTS}/${post.id}?include=author`);
    const body = (await read.json()) as PostDocument;
    expect(body.included?.map((item) => item.attributes)).toEqual([{ name: null }]);
    expect((await send(app, "GET", `${FILES}/${image.id}`)).status).toBe(200);
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const path = `${POSTS}/${post.id}`;
    expect((await send(app, "DELETE", path, { token: admin.accessToken })).status).toBe(204);
    const gone = await send(app, "GET", `${FILES}/${image.id}`, { token: admin.accessToken });
    expect(gone.status).toBe(404);
    expect(state.storage.size(`files/${image.id}`)).toBeUndefined();
  });

  it("커버 파일을 지우면 글의 커버가 null이 되고 updatedAt은 그대로다", async () => {
    const { app, state } = testApp();
    const manager = await userWith(app, state, ["posts:manage"]);
    const author = await newUser(app, state);
    const post = await writePost(app, author);
    const image = await uploadFile(app, manager);
    const covered = await patched(app, manager, post.id, {
      relationships: coverRelationship(image.id),
    });
    const removed = await send(app, "DELETE", `${FILES}/${image.id}`, {
      token: manager.accessToken,
    });
    expect(removed.status).toBe(204);
    const read = await send(app, "GET", `${POSTS}/${post.id}`, { token: author.accessToken });
    const { data } = (await read.json()) as PostDocument;
    expect(data.relationships.coverImage).toEqual({ data: null });
    expect(data.attributes.updatedAt).toBe(covered.attributes.updatedAt);
  });
});

describe("지우기", () => {
  it("관리자가 남의 글을 지우면 감사 로그를 남기고, 내 글을 지우면 남기지 않는다", async () => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    const own = await writePost(app, author);
    const theirs = await writePost(app, author);
    const remove = (user: SignedIn, postId: string) =>
      send(app, "DELETE", `${POSTS}/${postId}`, { token: user.accessToken });
    expect((await remove(author, own.id)).status).toBe(204);
    expect((await remove(manager, theirs.id)).status).toBe(204);
    const logs = state.store.auditLogs.filter((log) => log.targetType === "posts");
    expect(logs.map((log) => [log.action, log.actorId, log.targetId, log.metadata])).toEqual([
      ["post.deleted_by_admin", manager.userId, theirs.id, { author: author.userId }],
    ]);
    const gone = await send(app, "GET", `${POSTS}/${theirs.id}`, { token: author.accessToken });
    expect(gone.status).toBe(404);
    expect(await codesOf(await remove(manager, theirs.id), 404)).toEqual(["resource.not_found"]);
  });
});

/** 행동 하나의 요청: 메서드, 경로, 요청 문서. 발행된 글과 초안의 id로 만든다. */
type Action = (published: string, draft: string) => [string, string, unknown?];

const retitle = (postId: string) => updateDocument(postId, { attributes: { title: "고침" } });
const publish = (postId: string) => updateDocument(postId, { attributes: { status: "published" } });

const ACTIONS: Readonly<Record<string, Action>> = {
  read: (published) => ["GET", `${POSTS}/${published}`],
  read_draft: (_, draft) => ["GET", `${POSTS}/${draft}`],
  create: () => ["POST", POSTS, createDocument()],
  update: (published) => ["PATCH", `${POSTS}/${published}`, retitle(published)],
  update_draft: (_, draft) => ["PATCH", `${POSTS}/${draft}`, retitle(draft)],
  delete: (published) => ["DELETE", `${POSTS}/${published}`],
  publish: (_, draft) => ["PATCH", `${POSTS}/${draft}`, publish(draft)],
};

describe("권한 매트릭스", () => {
  // 행동마다 (비로그인, 작성자, 다른 회원, posts:manage)의 상태 코드. 초안은 볼 수 없으면 404, 볼 수
  // 있지만 고칠 수 없으면 403이다.
  it.each([
    ["read", [200, 200, 200, 200]],
    ["read_draft", [404, 200, 404, 200]],
    ["create", [401, 201, 201, 201]],
    ["update", [401, 200, 403, 200]],
    ["update_draft", [401, 200, 404, 200]],
    ["delete", [401, 204, 403, 204]],
    ["publish", [401, 200, 404, 200]],
  ])("%s: %j", async (name, expected) => {
    const { app, state } = testApp();
    const author = await newUser(app, state);
    const member = await newUser(app, state);
    const manager = await userWith(app, state, ["posts:manage"]);
    const action = ACTIONS[name];
    if (action === undefined) throw new Error(`행동 ${name}이 없다.`);
    const statuses: number[] = [];
    for (const viewer of [undefined, author, member, manager]) {
      // 사람마다 새 글을 만들어, 앞사람의 고치기와 지우기가 다음 사람의 결과를 바꾸지 않게 한다.
      const published = await writePost(app, author, { status: "published" });
      const draft = await writePost(app, author);
      const [method, path, document] = action(published.id, draft.id);
      const response = await send(app, method, path, {
        ...(document === undefined ? {} : { document }),
        ...(viewer === undefined ? {} : { token: viewer.accessToken }),
      });
      statuses.push(response.status);
    }
    expect(statuses).toEqual(expected);
  });
});
