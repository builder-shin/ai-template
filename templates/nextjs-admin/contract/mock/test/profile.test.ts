/**
 * 내 정보 바꾸기(PATCH /me: 이름, 로케일, 아바타)와 그때 나가는 me.updated, 아바타의 공개 읽기와 정리.
 * FastAPI 템플릿의 users/tests/test_me.py와 test_events.py 가운데 수정과 아바타에 해당하는 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { publicUsers } from "../src/modules/users/public.ts";
import { newUser, send, type SignedIn } from "./accounts.ts";
import { errorsOf, realtimeLog, stored, TIMESTAMP, testApp } from "./support.ts";
import { FILES, uploadFile } from "./uploads.ts";

type App = ReturnType<typeof testApp>["app"];

const ME = "/api/v1/me";
const AVATAR_POINTER = "/data/relationships/avatar/data";

interface MeDocument {
  data: {
    id: string;
    attributes: Record<string, unknown>;
    relationships: { avatar: { data: { type: string; id: string } | null } };
  };
  included?: { type: string; id: string; meta?: Record<string, unknown> }[];
  meta: { permissions: string[] };
}

function meUpdate(userId: string, data: Record<string, unknown> = {}) {
  return { data: { type: "users", id: userId, ...data } };
}

function avatarUpdate(userId: string, fileId: string | null) {
  const avatar = fileId === null ? null : { type: "files", id: fileId };
  return meUpdate(userId, { relationships: { avatar: { data: avatar } } });
}

function patchMe(app: App, user: SignedIn, document: unknown): Promise<Response> {
  return send(app, "PATCH", ME, { document, token: user.accessToken });
}

async function updated(app: App, user: SignedIn, document: unknown): Promise<MeDocument> {
  const response = await patchMe(app, user, document);
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as MeDocument;
}

describe("PATCH /me", () => {
  it("이름(앞뒤 공백을 지운다)과 로케일을 바꾸고 실제 권한과 함께 준다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const before = stored(state, user.userId).updatedAt;
    const document = meUpdate(user.userId, { attributes: { name: " 그레이스 ", locale: "en" } });
    const body = await updated(app, user, document);
    expect(body.data.attributes).toMatchObject({ name: "그레이스", locale: "en" });
    expect(body.data.attributes.updatedAt).toMatch(TIMESTAMP);
    expect(body.meta).toEqual({ permissions: ["posts:create"] });
    expect(Object.keys(body)).toEqual(["data", "meta"]);
    expect(stored(state, user.userId).updatedAt).toBeGreaterThan(before);
  });

  it("바뀐 것이 있을 때만 updatedAt을 바꾸고 me.updated(profile)를 보낸다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const log = realtimeLog(state);
    const rename = meUpdate(user.userId, { attributes: { name: "바꾼 이름" } });
    await updated(app, user, rename);
    const changedAt = stored(state, user.userId).updatedAt;
    await updated(app, user, rename);
    await updated(app, user, meUpdate(user.userId));
    expect(stored(state, user.userId).updatedAt).toBe(changedAt);
    expect(log).toEqual([
      ["me.updated", [`user:${user.userId}`], { meta: { changed: ["profile"] } }],
    ]);
  });

  it.each([
    [{ id: "01920000-0000-7000-8000-000000000000" }, 409, "resource.conflict", "/data/id"],
    [{ type: "roles" }, 409, "resource.conflict", "/data/type"],
    [{ attributes: { name: "" } }, 422, "validation.too_short", "/data/attributes/name"],
    [
      { relationships: { avatar: { data: { type: "files", id: randomUUID() } } } },
      404,
      "resource.not_found",
      AVATAR_POINTER,
    ],
  ])("%j는 %i %s(%s)다", async (data, status, code, pointer) => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const document = meUpdate(user.userId, data);
    const errors = await errorsOf(await patchMe(app, user, document), status);
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, { pointer }]]);
  });

  it("아바타가 틀리면 이름도 바꾸지 않는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const log = realtimeLog(state);
    const document = meUpdate(user.userId, {
      attributes: { name: "바뀌면 안 된다" },
      relationships: { avatar: { data: { type: "files", id: randomUUID() } } },
    });
    expect((await patchMe(app, user, document)).status).toBe(404);
    expect(stored(state, user.userId).name).toBe("가입자");
    expect(log).toEqual([]);
  });
});

describe("아바타", () => {
  it("올린 이미지를 아바타로 걸면 누구나 읽고, 빼면 그 파일을 지운다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const other = await newUser(app, state);
    const image = await uploadFile(app, user);
    const set = await updated(app, user, avatarUpdate(user.userId, image.id));
    expect(set.data.relationships.avatar).toEqual({ data: { type: "files", id: image.id } });
    const mine = await send(app, "GET", `${ME}?include=avatar`, { token: user.accessToken });
    const [included] = ((await mine.json()) as MeDocument).included ?? [];
    expect([included?.id, Object.keys(included?.meta ?? {})]).toEqual([
      image.id,
      ["downloadUrl", "downloadUrlExpiresAt"],
    ]);
    const url = `${FILES}/${image.id}`;
    const readers = [{ token: other.accessToken }, {}];
    const statuses = async () =>
      Promise.all(readers.map(async (reader) => (await send(app, "GET", url, reader)).status));
    expect(await statuses()).toEqual([200, 200]);
    const cleared = await updated(app, user, avatarUpdate(user.userId, null));
    expect(cleared.data.relationships.avatar).toEqual({ data: null });
    expect(await statuses()).toEqual([404, 404]);
    expect(state.storage.size(`files/${image.id}`)).toBeUndefined();
  });

  it("바꾸거나 뺀 아바타는 지운다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const first = await uploadFile(app, user);
    const second = await uploadFile(app, user);
    for (const fileId of [first.id, second.id, null]) {
      await updated(app, user, avatarUpdate(user.userId, fileId));
    }
    expect(state.store.files.size).toBe(0);
    expect(state.storage.size(`files/${second.id}`)).toBeUndefined();
  });

  it("같은 파일을 다시 걸면 아무것도 바꾸지 않는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    await updated(app, user, avatarUpdate(user.userId, image.id));
    const log = realtimeLog(state);
    await updated(app, user, avatarUpdate(user.userId, image.id));
    expect(log).toEqual([]);
    expect(state.store.files.has(image.id)).toBe(true);
  });

  it("아바타는 내가 올리고 업로드를 마친 이미지여야 한다", async () => {
    const files = { ...DEFAULT_CONFIG.files, allowedTypes: ["application/pdf", "image/png"] };
    const { app, state } = testApp({ files });
    const user = await newUser(app, state);
    const others = await uploadFile(app, await newUser(app, state));
    const pending = await uploadFile(app, user, { ready: false });
    const report = await uploadFile(app, user, {
      contentType: "application/pdf",
      filename: "report.pdf",
    });
    const cases = [
      [others.id, 404, "resource.not_found"],
      [pending.id, 422, "file.upload_incomplete"],
      [report.id, 422, "file.type_not_allowed"],
    ] as const;
    for (const [fileId, status, code] of cases) {
      const response = await patchMe(app, user, avatarUpdate(user.userId, fileId));
      const errors = await errorsOf(response, status);
      expect(errors.map((error) => [error.code, error.source])).toEqual([
        [code, { pointer: AVATAR_POINTER }],
      ]);
    }
    expect(stored(state, user.userId).avatarId).toBeNull();
  });

  it("관계의 id는 FastAPI처럼 Python의 uuid.UUID()로 읽는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    const loose = `{${image.id.replaceAll("-", "").toUpperCase()}}`;
    const body = await updated(app, user, avatarUpdate(user.userId, loose));
    expect(body.data.relationships.avatar.data?.id).toBe(image.id);
  });

  it("소유자가 아바타 파일을 지우면 관계가 null이 되고 updatedAt은 그대로다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const image = await uploadFile(app, user);
    await updated(app, user, avatarUpdate(user.userId, image.id));
    const before = stored(state, user.userId).updatedAt;
    const log = realtimeLog(state);
    const removed = await send(app, "DELETE", `${FILES}/${image.id}`, { token: user.accessToken });
    expect(removed.status).toBe(204);
    expect([stored(state, user.userId).avatarId, stored(state, user.userId).updatedAt]).toEqual([
      null,
      before,
    ]);
    expect(log).toEqual([]);
  });

  it("공개 표현은 id 순으로 이름과 아바타만 담는다", async () => {
    const { app, state } = testApp();
    const first = await newUser(app, state);
    const second = await newUser(app, state);
    const image = await uploadFile(app, second);
    await updated(app, second, avatarUpdate(second.userId, image.id));
    const ids = [second.userId, first.userId, second.userId, randomUUID()];
    expect(publicUsers(state.store, ids)).toEqual(
      [
        {
          type: "users",
          id: first.userId,
          attributes: { name: "가입자" },
          relationships: { avatar: { data: null } },
        },
        {
          type: "users",
          id: second.userId,
          attributes: { name: "가입자" },
          relationships: { avatar: { data: { type: "files", id: image.id } } },
        },
      ].sort((left, right) => (left.id < right.id ? -1 : 1)),
    );
  });
});
