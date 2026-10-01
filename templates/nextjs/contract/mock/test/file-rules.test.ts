/**
 * 다른 모듈이 쓰는 파일 함수: 읽기 규칙·참조 확인·삭제 처리의 등록, 관계에서 풀린 파일(release), 탈퇴한
 * 사용자의 파일(removeUnreferenced), 오래된 pending 파일 정리(purgePending), 다른 리소스에 걸 파일
 * (attachableFile), 포함 리소스(GET /me?include=avatar). FastAPI 템플릿의 files/service.py와
 * files/tests/test_jobs.py와 같은 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import type { Principal } from "../src/core/access.ts";
import { HOUR } from "../src/core/clock.ts";
import { ApiError, type ErrorObject } from "../src/jsonapi/errors.ts";
import {
  addReadRule,
  addReferenceCheck,
  onFilesDeleted,
  type ReadRule,
} from "../src/modules/files/registry.ts";
import {
  attachableFile,
  purgePending,
  release,
  removeUnreferenced,
} from "../src/modules/files/service.ts";
import type { MockState } from "../src/state.ts";
import { newUser, send, type SignedIn, signIn } from "./accounts.ts";
import { testApp, testClock } from "./support.ts";
import { FILES, uploadFile } from "./uploads.ts";

const POINTER = "/data/relationships/avatar/data";

/** 던진 ApiError의 에러 객체. */
function thrown(action: () => unknown): ErrorObject {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) return error.toErrorObject();
    throw error;
  }
  throw new Error("ApiError가 나야 한다");
}

function principalOf(user: SignedIn): Principal {
  return { userId: user.userId, sessionId: user.sessionId, permissions: new Set(), loggedInAt: 0 };
}

function remaining(state: MockState): string[] {
  return [...state.store.files.keys()].sort();
}

describe("release와 removeUnreferenced", () => {
  it("등록된 참조 확인이 가리키는 파일은 남기고 나머지는 행과 객체를 지운다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const kept = await uploadFile(app, user);
    const loose = await uploadFile(app, user);
    const pending = await uploadFile(app, user, { ready: false });
    addReferenceCheck(
      state.fileRegistry,
      (_store, ids) => new Set(ids.filter((id) => id === kept.id)),
    );
    expect(release(state, [kept.id, null, loose.id, loose.id, randomUUID()])).toEqual([loose.id]);
    expect(state.storage.size(`files/${loose.id}`)).toBeUndefined();
    expect(remaining(state)).toEqual([kept.id, pending.id].sort());
    expect(removeUnreferenced(state, user.userId)).toEqual([pending.id]);
    expect(remaining(state)).toEqual([kept.id]);
    expect(state.storage.size(`files/${kept.id}`)).toBeDefined();
    expect(release(state, [null])).toEqual([]);
  });

  it("삭제 처리가 지운 파일을 가리키던 관계를 null로 바꾼다(외래 키 ON DELETE SET NULL)", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const avatar = await uploadFile(app, user);
    const row = state.store.users.get(user.userId);
    if (row === undefined) throw new Error("사용자가 없다");
    row.avatarId = avatar.id;
    const updatedAt = row.updatedAt;
    const deleted: string[][] = [];
    const clearAvatars = (store: MockState["store"], ids: readonly string[]) => {
      deleted.push([...ids]);
      for (const owner of store.users.values()) {
        if (owner.avatarId !== null && ids.includes(owner.avatarId)) owner.avatarId = null;
      }
    };
    onFilesDeleted(state.fileRegistry, clearAvatars);
    onFilesDeleted(state.fileRegistry, clearAvatars);
    const response = await send(app, "DELETE", `${FILES}/${avatar.id}`, {
      token: user.accessToken,
    });
    expect(response.status).toBe(204);
    expect(deleted).toEqual([[avatar.id]]);
    expect([row.avatarId, row.updatedAt]).toEqual([null, updatedAt]);
  });

  it("같은 읽기 규칙을 두 번 등록해도 한 번만 부른다", async () => {
    const { app, state } = testApp();
    const calls: (string | undefined)[] = [];
    const rule: ReadRule = (_store, _fileId, viewer) => {
      calls.push(viewer?.userId);
      return false;
    };
    addReadRule(state.fileRegistry, rule);
    addReadRule(state.fileRegistry, rule);
    const owner = await newUser(app, state);
    const other = await newUser(app, state);
    const file = await uploadFile(app, owner);
    const response = await send(app, "GET", `${FILES}/${file.id}`, { token: other.accessToken });
    expect(response.status).toBe(404);
    expect(calls).toEqual([other.userId]);
  });
});

describe("purgePending", () => {
  it("24시간이 넘도록 pending인 파일만 행과 객체를 지운다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    const oldPending = await uploadFile(app, user, { ready: false });
    const oldReady = await uploadFile(app, user);
    clock.advance(25 * HOUR);
    // access token(15분)이 만료됐으므로 다시 로그인해 올린다.
    const newPending = await uploadFile(app, await signIn(app, user.email), { ready: false });
    expect(purgePending(state)).toBe(1);
    expect(remaining(state)).toEqual([oldReady.id, newPending.id].sort());
    expect(state.storage.size(`files/${oldPending.id}`)).toBeUndefined();
    expect(state.storage.size(`files/${newPending.id}`)).toBeDefined();
  });
});

describe("attachableFile", () => {
  it("요청한 사람 소유의 ready 이미지만 준다", async () => {
    const files = { ...DEFAULT_CONFIG.files, allowedTypes: ["image/png", "text/plain"] };
    const { app, state } = testApp({ files });
    const user = await newUser(app, state);
    const other = await newUser(app, state);
    const actor = principalOf(user);
    const image = await uploadFile(app, user);
    const braced = `{${image.id.toUpperCase()}}`;
    expect(attachableFile(state, actor, braced, POINTER).id).toBe(image.id);
    const theirs = await uploadFile(app, other);
    for (const fileId of [theirs.id, randomUUID(), "not-a-uuid"]) {
      expect(thrown(() => attachableFile(state, actor, fileId, POINTER))).toEqual({
        status: "404",
        code: "resource.not_found",
        title: "Not Found",
        detail: `File ${fileId} does not exist or is not yours.`,
        source: { pointer: POINTER },
      });
    }
    const pending = await uploadFile(app, user, { ready: false });
    expect(thrown(() => attachableFile(state, actor, pending.id, POINTER))).toEqual({
      status: "422",
      code: "file.upload_incomplete",
      title: "Unprocessable Content",
      detail: "The file has not been uploaded yet.",
      source: { pointer: POINTER },
    });
    const text = await uploadFile(app, user, { contentType: "text/plain", filename: "a.txt" });
    expect(thrown(() => attachableFile(state, actor, text.id, POINTER))).toEqual({
      status: "422",
      code: "file.type_not_allowed",
      title: "Unprocessable Content",
      detail: "Only images can be used here.",
      source: { pointer: POINTER },
      meta: { params: { allowed: "image/*" } },
    });
  });
});

describe("포함 리소스", () => {
  it("GET /me?include=avatar는 아바타 파일을 downloadUrl과 함께 담는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const get = async () => {
      const response = await send(app, "GET", "/api/v1/me?include=avatar", {
        token: user.accessToken,
      });
      expect(response.status).toBe(200);
      return (await response.json()) as {
        data: { relationships: { avatar: unknown } };
        included?: { type: string; id: string; meta?: Record<string, unknown> }[];
      };
    };
    expect((await get()).included).toBeUndefined();
    const avatar = await uploadFile(app, user);
    const row = state.store.users.get(user.userId);
    if (row === undefined) throw new Error("사용자가 없다");
    row.avatarId = avatar.id;
    const body = await get();
    expect(body.data.relationships.avatar).toEqual({ data: { type: "files", id: avatar.id } });
    expect(body.included?.map((file) => [file.type, file.id])).toEqual([["files", avatar.id]]);
    expect(Object.keys(body.included?.[0]?.meta ?? {})).toEqual([
      "downloadUrl",
      "downloadUrlExpiresAt",
    ]);
  });
});
