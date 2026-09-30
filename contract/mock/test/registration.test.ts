/**
 * 가입과 이메일 인증: 인증 메일(로케일, 링크), 중복 이메일, 재발송(늘 202), 1회용 토큰, 레이트 리밋.
 * FastAPI 템플릿의 auth/tests/test_accounts.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { HOUR } from "../src/core/clock.ts";
import { rolesOfUser } from "../src/modules/roles/service.ts";
import { findAccount } from "../src/modules/users/accounts.ts";
import {
  newEmail,
  register,
  registration,
  send,
  verification,
  verificationToken,
} from "./accounts.ts";
import { codesOf, errorsOf, TIMESTAMP, testApp, testClock } from "./support.ts";

const REGISTRATIONS = "/api/v1/registrations";
const VERIFICATIONS = "/api/v1/email-verifications";
const RESENDS = "/api/v1/email-verification-requests";
const LINK = /^http:\/\/localhost:3000\/verify-email\?token=[A-Za-z0-9_-]{43}$/m;

function resend(email: string) {
  return { data: { type: "email-verification-requests", attributes: { email } } };
}

describe("가입", () => {
  it("인증 전 member 계정을 만들고 인증 링크를 메일로 보낸다", async () => {
    const { app, state } = testApp();
    const email = newEmail();
    const response = await send(app, "POST", REGISTRATIONS, {
      document: registration(` ${email.toUpperCase()} `),
    });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: { id: string; attributes: { email: string; createdAt: string } };
    };
    expect(data).toEqual({
      type: "registrations",
      id: data.id,
      attributes: { email, createdAt: expect.stringMatching(TIMESTAMP) as unknown },
      relationships: { user: { data: { type: "users", id: data.id } } },
    });
    const user = findAccount(state.store, email);
    expect(user).toMatchObject({
      id: data.id,
      emailVerifiedAt: null,
      locale: "ko",
      name: "가입자",
    });
    expect(rolesOfUser(state.store, data.id).map((role) => role.name)).toEqual(["member"]);
    const [mail] = state.outbox.list(email);
    expect(mail?.subject).toBe("이메일 주소를 확인해 주세요");
    expect(mail?.text).toMatch(LINK);
    expect(mail?.text).toMatch(/^안녕하세요, 가입자님\.\n\n/);
  });

  it("Accept-Language로 메일 언어를 정하고, locale을 주면 그것을 쓴다", async () => {
    const { app, state } = testApp();
    const [english, korean] = [newEmail(), newEmail()];
    const headers = { "Accept-Language": "fr-FR,en-US;q=0.9,ko;q=0.8" };
    await send(app, "POST", REGISTRATIONS, { document: registration(english), headers });
    await send(app, "POST", REGISTRATIONS, {
      document: registration(korean, { locale: "ko" }),
      headers,
    });
    const [englishMail] = state.outbox.list(english);
    expect(englishMail?.subject).toBe("Confirm your email address");
    expect(englishMail?.text).toMatch(/^Hello 가입자,\n\nOpen the link below/);
    expect(state.outbox.list(korean)[0]?.subject).toBe("이메일 주소를 확인해 주세요");
    expect(findAccount(state.store, english)?.locale).toBe("en");
    const token = verificationToken(state, english);
    await send(app, "POST", VERIFICATIONS, { document: verification(token) });
    expect(state.outbox.list(english)[0]).toMatchObject({
      subject: "Welcome aboard",
      text: "가입자, your email address is confirmed. You can sign in now.\n\nhttp://localhost:3000\n",
    });
  });

  it.each([
    [{ email: "not-an-email" }, "validation.invalid_format", "/data/attributes/email"],
    [{ password: "x".repeat(7) }, "validation.too_short", "/data/attributes/password"],
    [{ name: "   " }, "validation.too_short", "/data/attributes/name"],
    [{ locale: "fr" }, "validation.invalid_choice", "/data/attributes/locale"],
  ])("필드를 검증한다: %j", async (attributes, code, pointer) => {
    const { app } = testApp();
    const document = registration(newEmail());
    Object.assign(document.data.attributes, attributes);
    const errors = await errorsOf(await send(app, "POST", REGISTRATIONS, { document }), 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, { pointer }]]);
  });

  it("이미 쓰는 이메일(대소문자 무시)은 422 validation.already_taken이다", async () => {
    const { app } = testApp();
    const { email } = await register(app);
    const response = await send(app, "POST", REGISTRATIONS, {
      document: registration(email.toUpperCase()),
    });
    expect(await errorsOf(response, 422)).toEqual([
      {
        status: "422",
        code: "validation.already_taken",
        title: "Unprocessable Content",
        detail: "The email address is already registered.",
        source: { pointer: "/data/attributes/email" },
      },
    ]);
  });
});

describe("이메일 인증", () => {
  it("링크의 토큰으로 한 번 인증하고 환영 메일을 보낸다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const token = verificationToken(state, email);
    const response = await send(app, "POST", VERIFICATIONS, { document: verification(token) });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: { type: string; id: string; attributes: { verifiedAt: string } };
    };
    expect(data.type).toBe("email-verifications");
    expect(data.attributes.verifiedAt).toMatch(TIMESTAMP);
    const user = findAccount(state.store, email);
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.updatedAt).toBe(user?.emailVerifiedAt);
    expect(state.outbox.list(email).map((mail) => mail.subject)).toEqual([
      "가입을 환영합니다",
      "이메일 주소를 확인해 주세요",
    ]);
    expect(state.outbox.list(email)[0]?.text).toBe(
      "가입자님, 이메일 확인이 끝났습니다. 이제 로그인할 수 있습니다.\n\nhttp://localhost:3000\n",
    );
    const again = await send(app, "POST", VERIFICATIONS, { document: verification(token) });
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

  it("24시간이 지난 토큰과 모르는 토큰은 틀린 토큰이다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const { email } = await register(app);
    const token = verificationToken(state, email);
    clock.advance(24 * HOUR);
    for (const attempt of [token, "x".repeat(43)]) {
      const response = await send(app, "POST", VERIFICATIONS, { document: verification(attempt) });
      expect(await codesOf(response, 422)).toEqual(["auth.verification_token_invalid"]);
    }
  });

  it("다시 받은 토큰으로 인증하면 전에 받은 토큰은 더 쓰지 못한다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const first = verificationToken(state, email);
    expect((await send(app, "POST", RESENDS, { document: resend(email) })).status).toBe(202);
    const second = verificationToken(state, email);
    expect(second).not.toBe(first);
    expect(
      (await send(app, "POST", VERIFICATIONS, { document: verification(second) })).status,
    ).toBe(201);
    const stale = await send(app, "POST", VERIFICATIONS, { document: verification(first) });
    expect(await codesOf(stale, 422)).toEqual(["auth.verification_token_invalid"]);
  });

  it("비활성 계정의 토큰은 틀린 토큰이고, 쓰지 않은 것으로 남는다", async () => {
    const { app, state } = testApp();
    const { email } = await register(app);
    const token = verificationToken(state, email);
    const user = findAccount(state.store, email);
    if (user === undefined) throw new Error("계정이 없다");
    user.status = "deactivated";
    const refused = await send(app, "POST", VERIFICATIONS, { document: verification(token) });
    expect(await codesOf(refused, 422)).toEqual(["auth.verification_token_invalid"]);
    user.status = "active";
    expect((await send(app, "POST", VERIFICATIONS, { document: verification(token) })).status).toBe(
      201,
    );
  });
});

describe("인증 메일 재발송", () => {
  it("늘 본문 없는 202이고, 인증 전인 활성 계정에만 보낸다", async () => {
    const { app, state } = testApp();
    const pending = await register(app);
    const verified = await register(app);
    await send(app, "POST", VERIFICATIONS, {
      document: verification(verificationToken(state, verified.email)),
    });
    state.outbox.clear();
    for (const email of [pending.email, verified.email, newEmail("nobody")]) {
      const response = await send(app, "POST", RESENDS, { document: resend(email) });
      expect([response.status, await response.text()]).toEqual([202, ""]);
    }
    expect(state.outbox.list(pending.email)).toHaveLength(1);
    expect(state.outbox.list(verified.email)).toEqual([]);
  });
});

describe("레이트 리밋", () => {
  it("가입은 IP별 시간당 한도를 넘으면 429와 Retry-After다", async () => {
    const clock = testClock();
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, registrationIp: 1 };
    const { app } = testApp({ rateLimits }, { clock });
    await register(app);
    const limited = await send(app, "POST", REGISTRATIONS, { document: registration(newEmail()) });
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await errorsOf(limited, 429)).toEqual([
      {
        status: "429",
        code: "rate_limit.exceeded",
        title: "Too Many Requests",
        detail: "Too many requests. Retry after 3600 seconds.",
        meta: { params: { retryAfter: 3600 } },
      },
    ]);
    clock.advance(HOUR);
    expect(
      (await send(app, "POST", REGISTRATIONS, { document: registration(newEmail()) })).status,
    ).toBe(201);
  });

  it("검증에 실패한 가입은 세지 않는다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, registrationIp: 1 };
    const { app } = testApp({ rateLimits });
    const invalid = registration(newEmail(), { password: "short" }); // betterleaks:allow 테스트용 짧은 비밀번호
    expect((await send(app, "POST", REGISTRATIONS, { document: invalid })).status).toBe(422);
    expect(
      (await send(app, "POST", REGISTRATIONS, { document: registration(newEmail()) })).status,
    ).toBe(201);
  });

  it("재발송은 이메일(대소문자 무시)별 한도를 넘으면 429다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, mailEmail: 1 };
    const { app } = testApp({ rateLimits });
    const email = newEmail();
    expect((await send(app, "POST", RESENDS, { document: resend(email) })).status).toBe(202);
    const again = await send(app, "POST", RESENDS, { document: resend(email.toUpperCase()) });
    expect(await codesOf(again, 429)).toEqual(["rate_limit.exceeded"]);
    expect((await send(app, "POST", RESENDS, { document: resend(newEmail()) })).status).toBe(202);
  });

  it("재발송은 IP별 한도도 있다", async () => {
    const rateLimits = { ...DEFAULT_CONFIG.rateLimits, mailIp: 1 };
    const { app } = testApp({ rateLimits });
    expect((await send(app, "POST", RESENDS, { document: resend(newEmail()) })).status).toBe(202);
    const other = await send(app, "POST", RESENDS, { document: resend(newEmail()) });
    expect(await codesOf(other, 429)).toEqual(["rate_limit.exceeded"]);
  });
});
