/**
 * 세션: grant 셋, 토큰 수명, refresh token 회전과 재사용 감지, 로그인 실패와 감사 기록, 레이트 리밋.
 * FastAPI 템플릿의 auth/tests/test_sessions.py와 test_events.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { DAY, MINUTE, SECOND } from "../src/core/clock.ts";
import type { RealtimeEvent } from "../src/core/realtime.ts";
import { identifierHash } from "../src/core/security.ts";
import type { components } from "../src/generated/api.ts";
import { findAccount } from "../src/modules/users/accounts.ts";
import type { MockState } from "../src/state.ts";
import {
  newEmail,
  newUser,
  PASSWORD,
  passwordGrant,
  refreshGrant,
  register,
  send,
  signIn,
  verify,
} from "./accounts.ts";
import { codesOf, errorsOf, TIMESTAMP, testApp, testClock } from "./support.ts";

const SESSIONS = "/api/v1/sessions";

type SessionWithTokensResource = components["schemas"]["SessionWithTokensResource"];

function grant(attributes: Record<string, unknown>) {
  return { data: { type: "sessions", attributes } };
}

/** 사용자의 룸으로 간 session.revoked의 사유. */
function reasonsOf(events: readonly RealtimeEvent[], userId: string): unknown[] {
  return events
    .filter((event) => event.name === "session.revoked" && event.rooms.includes(`user:${userId}`))
    .map((event) => (event.payload as { meta: { reason: string } }).meta.reason);
}

function recorded(state: MockState): RealtimeEvent[] {
  const events: RealtimeEvent[] = [];
  state.realtime.listen({ event: (event) => events.push(event) });
  return events;
}

describe("password grant", () => {
  it("토큰을 발급하고 로그인을 감사 로그에 남긴다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const { email, userId } = await register(app);
    await verify(app, state, email);
    const before = clock.now();
    const session = await signIn(app, email.toUpperCase(), PASSWORD, { "User-Agent": "phone" });
    const { attributes, relationships } = session.resource;
    expect(attributes).toMatchObject({ current: true, userAgent: "phone" });
    expect(relationships.user.data).toEqual({ type: "users", id: userId });
    expect(session.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const value of [attributes.createdAt, attributes.accessTokenExpiresAt]) {
      expect(value).toMatch(TIMESTAMP);
    }
    const accessTtl =
      Date.parse(attributes.accessTokenExpiresAt) - Date.parse(attributes.createdAt);
    const refreshTtl =
      Date.parse(attributes.refreshTokenExpiresAt) - Date.parse(attributes.createdAt);
    expect([accessTtl, refreshTtl]).toEqual([15 * 60_000, 30 * 86_400_000]);
    expect(Date.parse(attributes.createdAt)).toBeGreaterThanOrEqual(Math.floor(before / 1000));
    const listed = await send(app, "GET", SESSIONS, { token: session.accessToken });
    expect(listed.status).toBe(200);
    expect(state.store.auditLogs.at(-1)).toMatchObject({
      action: "session.login_succeeded",
      actorId: userId,
      targetType: "users",
      targetId: userId,
      metadata: { method: "password" },
      ipAddress: null,
    });
  });

  it("틀린 비밀번호와 없는 계정은 똑같이 401이고, 입력한 이메일의 해시만 남긴다", async () => {
    const { app, state, config } = testApp();
    const user = await newUser(app, state);
    const unknown = newEmail("nobody");
    for (const [email, password] of [
      [user.email, "wrong-password"], // betterleaks:allow 테스트용 틀린 비밀번호
      [unknown, PASSWORD],
    ] as const) {
      const response = await send(app, "POST", SESSIONS, {
        document: passwordGrant(email, password),
      });
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await errorsOf(response, 401)).toEqual([
        {
          status: "401",
          code: "auth.invalid_credentials",
          title: "Unauthorized",
          detail: "The email or password is wrong.",
        },
      ]);
    }
    const [known, missing] = state.store.auditLogs.slice(-2);
    expect(known).toMatchObject({
      action: "session.login_failed",
      actorId: null,
      targetType: "users",
      targetId: user.userId,
    });
    expect(missing).toMatchObject({ targetType: null, targetId: null });
    expect(missing?.metadata).toEqual({
      identifierHash: identifierHash(unknown, config.identifierHashSecret),
      reason: "invalid_credentials",
    });
  });

  it("식별자 해시는 FastAPI와 같은 HMAC-SHA256이다", () => {
    const key = "local-development-only-identifier-hash-key";
    expect(identifierHash("someone@example.com", key)).toBe(
      "b0bbe986f6361f100e0420c06cb4313e2f039eaf89ea8be57a1038703bb2c32f",
    );
  });

  it("인증 전 계정은 403 auth.email_not_verified, 비활성 계정은 403 auth.account_deactivated다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const early = await send(app, "POST", SESSIONS, { document: passwordGrant(email) });
    expect(await codesOf(early, 403)).toEqual(["auth.email_not_verified"]);
    const user = findAccount(state.store, email);
    if (user === undefined) throw new Error("계정이 없다");
    user.status = "deactivated";
    const closed = await send(app, "POST", SESSIONS, { document: passwordGrant(email) });
    expect(await codesOf(closed, 403)).toEqual(["auth.account_deactivated"]);
    const reasons = state.store.auditLogs.slice(-2).map((row) => row.metadata.reason);
    expect(reasons).toEqual(["email_not_verified", "account_deactivated"]);
  });

  it("이메일별 분당 한도를 넘으면 429다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, loginIdentifier: 2 };
    const { app } = testApp({ rateLimits });
    const email = newEmail();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await send(app, "POST", SESSIONS, { document: passwordGrant(email) })).status);
    }
    expect(statuses).toEqual([401, 401, 429]);
    const other = await send(app, "POST", SESSIONS, { document: passwordGrant(newEmail()) });
    expect(other.status).toBe(401);
  });

  it("IP별 분당 한도도 있고, 1분이 지나면 다시 센다", async () => {
    const clock = testClock();
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, loginIp: 1 };
    const { app } = testApp({ rateLimits }, { clock });
    expect(
      (await send(app, "POST", SESSIONS, { document: passwordGrant(newEmail()) })).status,
    ).toBe(401);
    const limited = await send(app, "POST", SESSIONS, { document: passwordGrant(newEmail()) });
    expect(limited.headers.get("retry-after")).toBe("60");
    clock.advance(MINUTE);
    expect(
      (await send(app, "POST", SESSIONS, { document: passwordGrant(newEmail()) })).status,
    ).toBe(401);
  });
});

describe("refreshToken grant", () => {
  it("토큰을 회전하고, 쓴 토큰을 다시 쓰면 세션을 폐기한다", async () => {
    const { app, state } = testApp();
    const events = recorded(state);
    const first = await newUser(app, state);
    const rotated = await send(app, "POST", SESSIONS, {
      document: refreshGrant(first.refreshToken),
    });
    expect(rotated.status).toBe(201);
    const second = (await rotated.json()) as {
      data: { id: string; attributes: { refreshToken: string; accessToken: string } };
    };
    expect(second.data.id).toBe(first.sessionId);
    expect(second.data.attributes.refreshToken).not.toBe(first.refreshToken);
    const renewed = second.data.attributes.accessToken;
    expect((await send(app, "GET", SESSIONS, { token: renewed })).status).toBe(200);

    const reused = await send(app, "POST", SESSIONS, {
      document: refreshGrant(first.refreshToken),
    });
    expect(reused.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(reused, 401)).toEqual([
      {
        status: "401",
        code: "auth.refresh_token_reused",
        title: "Unauthorized",
        detail: "The refresh token was already used. The session is revoked.",
      },
    ]);
    const after = await send(app, "GET", SESSIONS, { token: renewed });
    expect((await errorsOf(after, 401))[0]).toMatchObject({
      code: "auth.token_invalid",
      detail: "The session has ended.",
    });
    const latest = await send(app, "POST", SESSIONS, {
      document: refreshGrant(second.data.attributes.refreshToken),
    });
    expect(await codesOf(latest, 401)).toEqual(["auth.token_invalid"]);
    expect(reasonsOf(events, first.userId)).toEqual(["refresh_token_reused"]);
  });

  it("회전하면 lastUsedAt과 refresh token의 만료가 늘어난다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const first = await newUser(app, state);
    clock.advance(10 * DAY);
    const rotated = await send(app, "POST", SESSIONS, {
      document: refreshGrant(first.refreshToken),
    });
    const after = ((await rotated.json()) as { data: SessionWithTokensResource }).data.attributes;
    const before = first.resource.attributes;
    const daysBetween = (from: string, to: string) =>
      Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
    expect(after.createdAt).toBe(before.createdAt);
    expect(daysBetween(before.lastUsedAt, after.lastUsedAt)).toBe(10);
    expect(daysBetween(before.refreshTokenExpiresAt, after.refreshTokenExpiresAt)).toBe(10);
  });

  it("30일이 지난 refresh token은 틀린 토큰이다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    clock.advance(30 * DAY);
    const expired = await send(app, "POST", SESSIONS, {
      document: refreshGrant(user.refreshToken),
    });
    expect(await errorsOf(expired, 401)).toEqual([
      {
        status: "401",
        code: "auth.token_invalid",
        title: "Unauthorized",
        detail: "The refresh token is invalid.",
      },
    ]);
  });

  it("비활성 계정의 refresh token은 틀린 토큰이고 세션을 폐기하지 않는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const row = state.store.users.get(user.userId);
    if (row === undefined) throw new Error("계정이 없다");
    row.status = "deactivated";
    const refused = await send(app, "POST", SESSIONS, {
      document: refreshGrant(user.refreshToken),
    });
    expect(await codesOf(refused, 401)).toEqual(["auth.token_invalid"]);
    row.status = "active";
    expect(
      (await send(app, "POST", SESSIONS, { document: refreshGrant(user.refreshToken) })).status,
    ).toBe(201);
  });
});

describe("틀린 grant", () => {
  it.each([
    [{ grantType: "refreshToken", refreshToken: "x".repeat(43) }, 401, "auth.token_invalid", null],
    [{ grantType: "refreshToken", refreshToken: "\ud800" }, 401, "auth.token_invalid", null],
    [
      { grantType: "oauthCode", code: "abc", codeVerifier: "v".repeat(43) },
      401,
      "auth.oauth_code_invalid",
      null,
    ],
    [{ email: "a@example.com" }, 422, "validation.required", "/data/attributes/grantType"],
    [{ grantType: "magic" }, 422, "validation.invalid_choice", "/data/attributes/grantType"],
    [
      { grantType: "password", email: "a@example.com" },
      422,
      "validation.required",
      "/data/attributes/password",
    ],
  ])("%j → %i %s", async (attributes, status, code, pointer) => {
    const { app } = testApp();
    const response = await send(app, "POST", SESSIONS, { document: grant(attributes) });
    // 틀린 grant의 401도 challenge를 담는다(RFC 9110). 검증 오류(422)에는 없다.
    expect(response.headers.get("www-authenticate")).toBe(status === 401 ? "Bearer" : null);
    const errors = await errorsOf(response, status);
    expect(errors.map((error) => error.code)).toEqual([code]);
    if (pointer !== null) expect(errors[0]?.source).toEqual({ pointer });
  });
});

describe("access token", () => {
  it("15분이 지나도 30초까지는 받고, 그 뒤는 auth.token_expired다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    clock.advance(15 * MINUTE + 29 * SECOND);
    expect((await send(app, "GET", SESSIONS, { token: user.accessToken })).status).toBe(200);
    clock.advance(2 * SECOND);
    const expired = await send(app, "GET", SESSIONS, { token: user.accessToken });
    expect(expired.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(expired, 401)).toEqual([
      {
        status: "401",
        code: "auth.token_expired",
        title: "Unauthorized",
        detail: "The access token has expired.",
      },
    ]);
  });

  it("모르는 토큰은 auth.token_invalid이고, 비활성 사용자의 토큰은 세션이 끝난 것이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const forged = await send(app, "GET", SESSIONS, { token: "not-a-token" });
    expect((await errorsOf(forged, 401))[0]?.detail).toBe("The access token is invalid.");
    const row = state.store.users.get(user.userId);
    if (row !== undefined) row.status = "deactivated";
    const closed = await send(app, "GET", SESSIONS, { token: user.accessToken });
    expect((await errorsOf(closed, 401))[0]).toMatchObject({
      code: "auth.token_invalid",
      detail: "The session has ended.",
    });
  });

  it("만료된 세션의 토큰도 세션이 끝난 것이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    // access token은 세션의 만료를 늘린 직후에만 발급하므로 실제로는 세션보다 먼저 만료된다(재검사가
    // 만나는 경우). 그래서 세션의 만료를 저장소에서 앞당긴다.
    const login = state.store.sessions.get(user.sessionId);
    if (login === undefined) throw new Error("세션이 없다");
    login.expiresAt = state.clock.now();
    const ended = await send(app, "GET", SESSIONS, { token: user.accessToken });
    expect((await errorsOf(ended, 401))[0]).toMatchObject({
      code: "auth.token_invalid",
      detail: "The session has ended.",
    });
  });
});

describe("시드 관리자", () => {
  it("설정의 관리자로 로그인하면 모든 권한을 가진다", async () => {
    const { app, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const me = await send(app, "GET", "/api/v1/me", { token: admin.accessToken });
    const body = (await me.json()) as { meta: { permissions: string[] } };
    expect(body.meta.permissions).toHaveLength(8);
  });
});
