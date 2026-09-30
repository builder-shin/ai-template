/**
 * 비밀번호: 재설정 요청(늘 202, 로케일별 재설정 메일), 재설정(1회용 토큰, 모든 세션 폐기, 이메일 인증),
 * 변경(현재 비밀번호 확인, 현재 세션만 남김, 재설정 토큰 삭제, 사용자별 레이트 리밋)과 그때 나가는
 * session.revoked와 감사 로그. FastAPI 템플릿의 auth/tests/test_passwords.py, test_mails.py,
 * test_events.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { HOUR } from "../src/core/clock.ts";
import { openSession } from "../src/modules/auth/credentials.ts";
import { issueAccountToken } from "../src/modules/auth/tokens.ts";
import { createAccount, findAccount } from "../src/modules/users/accounts.ts";
import type { MockState } from "../src/state.ts";
import {
  mailToken,
  newEmail,
  newUser,
  PASSWORD,
  passwordGrant,
  register,
  registration,
  send,
  signIn,
  verificationToken,
} from "./accounts.ts";
import { codesOf, errorsOf, revokedReasons, TIMESTAMP, testApp, testClock } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

const REQUESTS = "/api/v1/password-reset-requests";
const RESETS = "/api/v1/password-resets";
const CHANGES = "/api/v1/password-changes";
const SESSIONS = "/api/v1/sessions";
const NEW_PASSWORD = "brand-new-password"; // betterleaks:allow 테스트용 가짜 비밀번호
const WRONG_PASSWORD = "not-my-password"; // betterleaks:allow 테스트용 틀린 비밀번호
const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function resetRequest(email: string) {
  return { data: { type: "password-reset-requests", attributes: { email } } };
}

function reset(token: string, password = NEW_PASSWORD) {
  return { data: { type: "password-resets", attributes: { token, password } } };
}

function change(currentPassword: string, newPassword = NEW_PASSWORD) {
  return { data: { type: "password-changes", attributes: { currentPassword, newPassword } } };
}

/** 재설정을 요청하고 받은 메일의 토큰을 돌려준다. */
async function resetToken(app: App, state: MockState, email: string): Promise<string> {
  const response = await send(app, "POST", REQUESTS, { document: resetRequest(email) });
  expect(response.status).toBe(202);
  return mailToken(state, email, "/reset-password");
}

/** 비밀번호로 로그인한 응답의 상태. */
async function logIn(app: App, email: string, password: string): Promise<number> {
  const response = await send(app, "POST", SESSIONS, { document: passwordGrant(email, password) });
  return response.status;
}

/** API를 거치지 않고 연 세션의 access token(FastAPI 테스트의 accounts.sign_in). */
function openedSession(state: MockState, userId: string): string {
  return openSession(state.store, userId, null, state.clock.now()).accessToken;
}

function passwordAudits(state: MockState) {
  return state.store.auditLogs
    .filter((row) => row.action.startsWith("user.password_"))
    .map((row) => [row.action, row.actorId, row.targetType, row.targetId, row.metadata]);
}

describe("재설정 요청", () => {
  it("늘 본문 없는 202이고, 이메일이 있는 활성 계정에만 재설정 메일을 보낸다", async () => {
    const { app, state } = testApp();
    const pending = await register(app);
    const closed = await register(app);
    const closedUser = findAccount(state.store, closed.email);
    if (closedUser === undefined) throw new Error("계정이 없다");
    closedUser.status = "deactivated";
    state.outbox.clear();
    const nobody = newEmail("nobody");
    for (const email of [pending.email, closed.email, nobody]) {
      const response = await send(app, "POST", REQUESTS, { document: resetRequest(email) });
      expect([response.status, await response.text()]).toEqual([202, ""]);
    }
    expect(state.outbox.list(closed.email)).toEqual([]);
    expect(state.outbox.list(nobody)).toEqual([]);
    const [mail] = state.outbox.list(pending.email);
    expect(mail?.subject).toBe("비밀번호 재설정 안내");
    expect(mail?.text).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=[\w-]{43}$/m);
    expect(mail?.text.replace(/token=[\w-]+/, "token=<token>")).toBe(
      "안녕하세요, 가입자님.\n\n" +
        "아래 링크를 열어 새 비밀번호를 정해 주세요. 링크는 1시간 동안 쓸 수 있습니다.\n\n" +
        "http://localhost:3000/reset-password?token=<token>\n\n" +
        "비밀번호 재설정을 요청하지 않았다면 이 메일을 무시해도 됩니다. 비밀번호는 바뀌지 않습니다.\n",
    );
  });

  it("영어 계정에는 영어로 보낸다", async () => {
    const { app, state } = testApp();
    const email = newEmail();
    await send(app, "POST", "/api/v1/registrations", {
      document: registration(email, { locale: "en" }),
    });
    await resetToken(app, state, email);
    const [mail] = state.outbox.list(email);
    expect(mail?.subject).toBe("Reset your password");
    expect(mail?.text.replace(/token=[\w-]+/, "token=<token>")).toBe(
      "Hello 가입자,\n\n" +
        "Open the link below to choose a new password. The link works for one hour.\n\n" +
        "http://localhost:3000/reset-password?token=<token>\n\n" +
        "If you did not ask to reset your password, you can ignore this email. Your password stays the same.\n",
    );
  });

  it("인증 메일 재발송과 이메일별 한도를 나눠 쓴다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, mailEmail: 1 };
    const { app } = testApp({ rateLimits });
    const email = newEmail();
    const resend = await send(app, "POST", "/api/v1/email-verification-requests", {
      document: { data: { type: "email-verification-requests", attributes: { email } } },
    });
    expect(resend.status).toBe(202);
    const limited = await send(app, "POST", REQUESTS, { document: resetRequest(email) });
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await codesOf(limited, 429)).toEqual(["rate_limit.exceeded"]);
  });

  it("이메일 형식이 틀리면 422이고 세지 않는다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, mailIp: 1 };
    const { app } = testApp({ rateLimits });
    const invalid = await send(app, "POST", REQUESTS, { document: resetRequest("not-an-email") });
    const errors = await errorsOf(invalid, 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([
      ["validation.invalid_format", { pointer: "/data/attributes/email" }],
    ]);
    expect((await send(app, "POST", REQUESTS, { document: resetRequest(newEmail()) })).status).toBe(
      202,
    );
  });
});

describe("재설정", () => {
  it("토큰으로 비밀번호를 바꾸고, 이메일을 인증하고, 모든 세션을 끝낸다", async () => {
    const { app, state } = testApp();
    const { email, userId } = await register(app);
    const accessToken = openedSession(state, userId);
    const reasons = revokedReasons(state, userId);
    const token = await resetToken(app, state, email);
    const response = await send(app, "POST", RESETS, { document: reset(token) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: {
        type: "password-resets",
        id: expect.stringMatching(UUID7) as unknown,
        attributes: { createdAt: expect.stringMatching(TIMESTAMP) as unknown },
      },
    });
    const blocked = await send(app, "GET", SESSIONS, { token: accessToken });
    expect(await codesOf(blocked, 401)).toEqual(["auth.token_invalid"]);
    expect(await logIn(app, email, PASSWORD)).toBe(401);
    expect(await logIn(app, email, NEW_PASSWORD)).toBe(201);
    const user = findAccount(state.store, email);
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.updatedAt).toBe(user?.emailVerifiedAt);
    expect(reasons()).toEqual([["session.revoked", "password_reset"]]);
    expect(passwordAudits(state)).toEqual([["user.password_reset", userId, "users", userId, {}]]);
    expect(state.outbox.list(email).map((mail) => mail.subject)).toEqual([
      "비밀번호 재설정 안내",
      "이메일 주소를 확인해 주세요",
    ]);
    const again = await send(app, "POST", RESETS, { document: reset(token) });
    expect(await errorsOf(again, 422)).toEqual([
      {
        status: "422",
        code: "auth.verification_token_invalid",
        title: "Unprocessable Content",
        detail: "The token is wrong or has expired.",
        source: { pointer: "/data/attributes/token" },
      },
    ]);
  });

  it("1시간이 지난 토큰, 모르는 토큰, 인증 메일의 토큰은 틀린 토큰이다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const { email } = await register(app);
    const expired = await resetToken(app, state, email);
    clock.advance(HOUR);
    for (const attempt of [expired, "x".repeat(43), verificationToken(state, email)]) {
      const response = await send(app, "POST", RESETS, { document: reset(attempt) });
      expect(await codesOf(response, 422)).toEqual(["auth.verification_token_invalid"]);
    }
  });

  it("다시 받은 토큰으로 바꾸면 전에 받은 토큰은 더 쓰지 못한다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const first = await resetToken(app, state, email);
    const second = await resetToken(app, state, email);
    expect(second).not.toBe(first);
    expect((await send(app, "POST", RESETS, { document: reset(second) })).status).toBe(201);
    const stale = await send(app, "POST", RESETS, { document: reset(first) });
    expect(await codesOf(stale, 422)).toEqual(["auth.verification_token_invalid"]);
  });

  it("비활성 계정의 토큰은 틀린 토큰이고, 쓰지 않은 것으로 남는다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const token = await resetToken(app, state, email);
    const user = findAccount(state.store, email);
    if (user === undefined) throw new Error("계정이 없다");
    user.status = "deactivated";
    const refused = await send(app, "POST", RESETS, { document: reset(token) });
    expect(await codesOf(refused, 422)).toEqual(["auth.verification_token_invalid"]);
    user.status = "active";
    expect((await send(app, "POST", RESETS, { document: reset(token) })).status).toBe(201);
  });

  it("새 비밀번호가 짧으면 422이고 토큰은 남는다. 폐기할 세션이 없으면 이벤트가 없다", async () => {
    const { app, state } = testApp();
    const { email, userId } = await register(app);
    const reasons = revokedReasons(state, userId);
    const token = await resetToken(app, state, email);
    const short = await send(app, "POST", RESETS, { document: reset(token, "x".repeat(7)) });
    const errors = await errorsOf(short, 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([
      ["validation.too_short", { pointer: "/data/attributes/password" }],
    ]);
    expect((await send(app, "POST", RESETS, { document: reset(token) })).status).toBe(201);
    expect(reasons()).toEqual([]);
  });
});

describe("변경", () => {
  it("현재 비밀번호를 확인하고, 현재 세션은 남기고 다른 세션은 끝낸다", async () => {
    const { app, state } = testApp();
    const current = await newUser(app, state);
    const other = await signIn(app, current.email);
    const reasons = revokedReasons(state, current.userId);
    const token = current.accessToken;
    const wrong = await send(app, "POST", CHANGES, { document: change(WRONG_PASSWORD), token });
    expect(wrong.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(wrong, 401)).toEqual([
      {
        status: "401",
        code: "auth.invalid_credentials",
        title: "Unauthorized",
        detail: "The current password is wrong.",
        source: { pointer: "/data/attributes/currentPassword" },
      },
    ]);
    expect(passwordAudits(state)).toEqual([]);
    const response = await send(app, "POST", CHANGES, { document: change(PASSWORD), token });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: {
        type: "password-changes",
        id: expect.stringMatching(UUID7) as unknown,
        attributes: { createdAt: expect.stringMatching(TIMESTAMP) as unknown },
      },
    });
    expect((await send(app, "GET", SESSIONS, { token })).status).toBe(200);
    const ended = await send(app, "GET", SESSIONS, { token: other.accessToken });
    expect(await codesOf(ended, 401)).toEqual(["auth.token_invalid"]);
    expect(await logIn(app, current.email, PASSWORD)).toBe(401);
    expect(await logIn(app, current.email, NEW_PASSWORD)).toBe(201);
    expect(reasons()).toEqual([["session.revoked", "password_changed"]]);
    const userId = current.userId;
    expect(passwordAudits(state)).toEqual([["user.password_changed", userId, "users", userId, {}]]);
  });

  it("바꾸기 전에 요청한 재설정 토큰을 지우고 인증 토큰은 남긴다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const token = await resetToken(app, state, user.email);
    issueAccountToken(state.store, user.userId, "email_verification", state.clock.now());
    const document = change(PASSWORD);
    expect((await send(app, "POST", CHANGES, { document, token: user.accessToken })).status).toBe(
      201,
    );
    const stale = await send(app, "POST", RESETS, { document: reset(token, "other-password") });
    expect(await codesOf(stale, 422)).toEqual(["auth.verification_token_invalid"]);
    const left = [...state.store.accountTokens.values()].filter(
      (row) => row.userId === user.userId,
    );
    expect(left.map((row) => row.purpose)).toEqual(["email_verification"]);
  });

  it("사용자별 시간당 한도를 넘으면 429다. 검증에 실패한 요청은 세지 않는다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, passwordChangeUser: 2 };
    const { app, state } = testApp({ rateLimits });
    const user = await newUser(app, state);
    const attempt = (document: unknown, token = user.accessToken) =>
      send(app, "POST", CHANGES, { document, token });
    expect((await attempt(change(WRONG_PASSWORD, "short"))).status).toBe(422);
    const statuses = [];
    for (let count = 0; count < 3; count += 1) {
      statuses.push((await attempt(change(WRONG_PASSWORD))).status);
    }
    expect(statuses).toEqual([401, 401, 429]);
    const limited = await attempt(change(PASSWORD));
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await codesOf(limited, 429)).toEqual(["rate_limit.exceeded"]);
    const other = await newUser(app, state);
    expect((await attempt(change(WRONG_PASSWORD), other.accessToken)).status).toBe(401);
  });

  it("비밀번호가 없는 계정(소셜 전용)은 바꾸지 못한다", async () => {
    const { app, state } = testApp();
    const account = {
      email: newEmail("social"),
      password: null,
      name: null,
      locale: "ko" as const,
      verified: true,
    };
    const user = createAccount(state.store, account, state.clock.now());
    const token = openedSession(state, user.id);
    const response = await send(app, "POST", CHANGES, { document: change(PASSWORD), token });
    expect(await codesOf(response, 401)).toEqual(["auth.invalid_credentials"]);
  });

  it("다른 세션이 없으면 이벤트를 보내지 않는다. 로그인하지 않으면 본문보다 먼저 401이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const reasons = revokedReasons(state, user.userId);
    const document = change(PASSWORD);
    expect((await send(app, "POST", CHANGES, { document, token: user.accessToken })).status).toBe(
      201,
    );
    expect(reasons()).toEqual([]);
    const anonymous = await send(app, "POST", CHANGES, { document: change("", "short") });
    expect(await codesOf(anonymous, 401)).toEqual(["auth.unauthenticated"]);
  });
});
