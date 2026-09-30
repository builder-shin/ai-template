/**
 * 탈퇴(DELETE /me): 익명화, 역할 회수, 파일 정리, 계정 닫기(세션 폐기, 토큰 삭제), 감사 로그, 최근 로그인,
 * 마지막 admin. FastAPI 템플릿의 users/tests/test_me.py의 탈퇴와 auth/tests/test_closing.py와 같은
 * 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { type Principal, RECENT_LOGIN, requireRecentLogin } from "../src/core/access.ts";
import { MINUTE } from "../src/core/clock.ts";
import { ApiError } from "../src/jsonapi/errors.ts";
import { issueAccountToken } from "../src/modules/auth/tokens.ts";
import { closeAccount, createAccount } from "../src/modules/users/accounts.ts";
import type { MockState } from "../src/state.ts";
import {
  newEmail,
  newUser,
  PASSWORD,
  passwordGrant,
  register,
  send,
  type SignedIn,
  signIn,
} from "./accounts.ts";
import { codesOf, errorsOf, realtimeLog, stored, testApp, testClock } from "./support.ts";
import { uploadFile } from "./uploads.ts";

type App = ReturnType<typeof testApp>["app"];

const ME = "/api/v1/me";

function leave(app: App, user: SignedIn): Promise<Response> {
  return send(app, "DELETE", ME, { token: user.accessToken });
}

/** 폐기하지 않은 세션 수와 남은 1회용 토큰 수. */
function credentials(state: MockState, userId: string): [number, number] {
  const sessions = [...state.store.sessions.values()].filter(
    (login) => login.userId === userId && login.revokedAt === null,
  );
  const tokens = [...state.store.accountTokens.values()].filter((row) => row.userId === userId);
  return [sessions.length, tokens.length];
}

function newAdmin(state: MockState, status: "active" | "deactivated" = "active") {
  const account = {
    email: newEmail("admin"),
    password: PASSWORD,
    name: "관리자",
    locale: "ko" as const,
    verified: true,
    roleNames: ["admin"],
  };
  const admin = createAccount(state.store, account, state.clock.now());
  admin.status = status;
  return admin;
}

describe("DELETE /me", () => {
  it("개인정보를 지우고, 역할을 빼고, 파일을 정리하고, 계정을 닫는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const other = await signIn(app, user.email);
    const avatar = await uploadFile(app, user);
    const loose = await uploadFile(app, user, { ready: false });
    const document = {
      data: {
        type: "users",
        id: user.userId,
        relationships: { avatar: { data: { type: "files", id: avatar.id } } },
      },
    };
    expect((await send(app, "PATCH", ME, { document, token: user.accessToken })).status).toBe(200);
    issueAccountToken(state.store, user.userId, "password_reset", state.clock.now());
    const log = realtimeLog(state);
    expect((await leave(app, user)).status).toBe(204);
    expect(log).toEqual([
      ["session.revoked", [`user:${user.userId}`], { meta: { reason: "account_deleted" } }],
      ["recheck", [user.userId]],
    ]);
    for (const session of [user, other]) {
      const response = await send(app, "GET", ME, { token: session.accessToken });
      expect(await codesOf(response, 401)).toEqual(["auth.token_invalid"]);
    }
    const row = stored(state, user.userId);
    expect([row.email, row.name, row.passwordHash, row.avatarId, row.status]).toEqual([
      null,
      null,
      null,
      null,
      "deleted",
    ]);
    expect([row.locale, row.emailVerifiedAt === null]).toEqual(["ko", false]);
    expect(state.store.userRoles.has(user.userId)).toBe(false);
    expect(credentials(state, user.userId)).toEqual([0, 0]);
    expect(state.store.files.size).toBe(0);
    for (const file of [avatar, loose]) {
      expect(state.storage.size(`files/${file.id}`)).toBeUndefined();
    }
    const audits = state.store.auditLogs.filter((audit) => audit.action === "user.deleted");
    expect(audits.map((audit) => [audit.actorId, audit.targetType, audit.targetId])).toEqual([
      [user.userId, "users", user.userId],
    ]);
    expect(audits[0]?.metadata).toEqual({});
  });

  it("탈퇴하면 로그인하지 못하고, 같은 이메일로 다시 가입할 수 있다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    expect((await leave(app, user)).status).toBe(204);
    const login = await send(app, "POST", "/api/v1/sessions", {
      document: passwordGrant(user.email),
    });
    expect(await codesOf(login, 401)).toEqual(["auth.invalid_credentials"]);
    const again = await register(app, user.email);
    expect(again.userId).not.toBe(user.userId);
  });

  it("로그인한 지 10분이 지난 세션은 401 auth.reauthentication_required다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    clock.advance(11 * MINUTE);
    const response = await leave(app, user);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_user_authentication", max_age=600',
    );
    expect(await errorsOf(response, 401)).toEqual([
      {
        status: "401",
        code: "auth.reauthentication_required",
        title: "Unauthorized",
        detail: "Log in again: this needs a session that logged in within 600 seconds.",
      },
    ]);
    expect((await send(app, "GET", ME, { token: user.accessToken })).status).toBe(200);
    expect(stored(state, user.userId).status).toBe("active");
    expect((await leave(app, await signIn(app, user.email))).status).toBe(204);
  });

  it("최근 로그인은 로그인한 지 딱 10분까지다", () => {
    const principal: Principal = {
      userId: "u",
      sessionId: "s",
      permissions: new Set(),
      loggedInAt: 0,
    };
    expect(() => {
      requireRecentLogin(principal, RECENT_LOGIN);
    }).not.toThrow();
    expect(() => {
      requireRecentLogin(principal, RECENT_LOGIN + 1);
    }).toThrow(ApiError);
  });

  it("마지막 활성 admin은 탈퇴하지 못한다", async () => {
    const { app, state, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    newAdmin(state, "deactivated");
    const refused = await leave(app, admin);
    expect(await errorsOf(refused, 422)).toEqual([
      {
        status: "422",
        code: "role.last_admin_protected",
        title: "Unprocessable Content",
        detail: "The last active admin must keep the admin role and stay active.",
      },
    ]);
    expect(stored(state, admin.userId).status).toBe("active");
    newAdmin(state);
    expect((await leave(app, admin)).status).toBe(204);
  });
});

describe("계정 닫기", () => {
  /** 세션 둘과 재설정 토큰 하나를 가진 계정을 닫고 (살아 있는 세션 수, 남은 토큰 수)를 돌려준다. */
  async function closed(closure: "deactivated" | "deleted") {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    await signIn(app, user.email);
    issueAccountToken(state.store, user.userId, "password_reset", state.clock.now());
    const log = realtimeLog(state);
    closeAccount(state, user.userId, closure);
    return { counts: credentials(state, user.userId), log, user };
  }

  it("비활성화는 세션을 모두 폐기하고 토큰은 남긴다", async () => {
    const { counts, log, user } = await closed("deactivated");
    expect(counts).toEqual([0, 1]);
    expect(log).toEqual([
      ["session.revoked", [`user:${user.userId}`], { meta: { reason: "account_deactivated" } }],
      ["recheck", [user.userId]],
    ]);
  });

  it("탈퇴는 토큰도 지운다", async () => {
    const { counts } = await closed("deleted");
    expect(counts).toEqual([0, 0]);
  });

  it("폐기할 세션이 없으면 session.revoked를 보내지 않는다", async () => {
    const { app, state } = testApp();
    const { userId } = await register(app);
    const log = realtimeLog(state);
    closeAccount(state, userId, "deactivated");
    expect(log).toEqual([]);
  });
});
