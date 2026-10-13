import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { verifyPassword } from "../../../core/security/passwords.js";
import { ApiError } from "../../../core/jsonapi/errors.js";
import { fixture, at, user } from "./fixtures.js";
const input = {
  email: " Member@Example.COM ",
  password: "password-123", // betterleaks:allow 사유: 가입 단위 시험의 가짜 비밀번호
  name: "민수",
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
});
afterEach(() => {
  vi.useRealTimers();
});
it("가입은 정규화 이메일과 비밀번호 해시와 member 역할을 함께 만들고 commit 뒤 인증 잡을 넣는다", async () => {
  const f = fixture();
  const result = await f.registration.create(input, "192.0.2.1", "en-US");
  expect(f.state.users[0]).toMatchObject({
    email: "member@example.com",
    name: "민수",
    locale: "en",
    emailVerifiedAt: null,
  });
  expect(await verifyPassword(f.state.users[0]?.passwordHash ?? "", input.password)).toBe(true);
  expect(f.state.roles).toEqual([`${user.id}:member`]);
  expect(f.limits).toEqual([["registration.ip", "192.0.2.1"]]);
  expect(f.events).toEqual(["begin", "commit", "enqueue"]);
  expect(f.jobs).toEqual([{ name: "auth.send_verification_mail", data: { id: user.id } }]);
  expect(result).toEqual({
    data: {
      type: "registrations",
      id: user.id,
      attributes: { email: "member@example.com", createdAt: at.toISOString() },
      relationships: { user: { data: { type: "users", id: user.id } } },
    },
  });
});
it("명시한 locale이 Accept-Language보다 우선한다", async () => {
  const f = fixture();
  await f.registration.create({ ...input, locale: "ko" }, "ip", "en");
  expect(f.state.users[0]?.locale).toBe("ko");
});
it("동일 이메일의 고유 위반은 이메일 pointer를 가진 422이고 사용자나 잡을 남기지 않는다", async () => {
  const f = fixture();
  f.failure = Object.assign(new Error("이메일 고유 위반"), {
    code: "P2002",
    meta: { target: ["email"] },
  });
  await expect(f.registration.create(input, "ip")).rejects.toMatchObject({
    init: {
      status: 422,
      code: "validation.already_taken",
      source: { pointer: "/data/attributes/email" },
    },
  });
  expect(f.state.users).toEqual([]);
  expect(f.jobs).toEqual([]);
  expect(f.events).toEqual(["begin", "rollback"]);
});
it("다른 DB 오류를 중복 이메일로 바꾸지 않는다", async () => {
  const f = fixture();
  const failure = new Error("DB 시험 실패");
  f.failure = failure;
  await expect(f.registration.create(input, "ip")).rejects.toBe(failure);
  expect(f.jobs).toEqual([]);
});
it("가입 제한에 걸리면 쓰기와 큐 등록을 시작하지 않는다", async () => {
  const f = fixture();
  const failure = new ApiError({
    status: 429,
    code: "rate_limit.exceeded",
    title: "Too many requests",
  });
  f.limitFailure = failure;
  await expect(f.registration.create(input, "ip")).rejects.toBe(failure);
  expect(f.events).toEqual([]);
});
it.each([false, true])(
  "재발송은 계정 유무 %s에 같은 결과를 내고 정규화 이메일 해시로 제한한다",
  async (exists) => {
    const f = fixture();
    if (exists) f.addUser();
    await f.verification.request(" Member@Example.COM ", "192.0.2.2");
    expect(f.limits).toEqual([
      ["mail.ip", "192.0.2.2"],
      [
        "mail.email",
        createHmac("sha256", "registration-fixture-key").update("member@example.com").digest("hex"),
      ],
    ]);
    expect(f.jobs).toEqual(
      exists ? [{ name: "auth.send_verification_mail", data: { id: user.id } }] : [],
    );
  },
);
it.each([{ emailVerifiedAt: at }, { status: "deactivated" }, { status: "deleted" }])(
  "발송할 수 없는 계정 %j에는 재발송 잡을 넣지 않는다",
  async (changes) => {
    const f = fixture();
    f.addUser(changes);
    await f.verification.request(user.email ?? "", "ip");
    expect(f.jobs).toEqual([]);
  },
);
it("인증은 토큰을 한 번 소비하고 commit 뒤 환영 잡을 넣는다", async () => {
  const f = fixture();
  f.addUser();
  f.addToken("one-use");
  expect(await f.verification.verify("one-use")).toEqual({
    data: {
      type: "email-verifications",
      id: "01900000-0000-7000-8000-000000000002",
      attributes: { verifiedAt: at.toISOString() },
    },
  });
  expect(f.state.users[0]?.emailVerifiedAt).toEqual(at);
  expect(f.state.tokens).toEqual([]);
  expect(f.jobs).toEqual([{ name: "auth.send_welcome_mail", data: { id: user.id } }]);
  await expect(f.verification.verify("one-use")).rejects.toMatchObject({
    init: { status: 422, code: "auth.verification_token_invalid" },
  });
  expect(f.jobs).toHaveLength(1);
});
it.each(["wrong", "expired", "reset"])(
  "%s 토큰은 인증 422이고 환영 잡을 넣지 않는다",
  async (kind) => {
    const f = fixture();
    f.addUser();
    f.addToken(
      "fixture-token",
      kind === "expired" ? { expiresAt: at } : kind === "reset" ? { purpose: "reset" } : {},
    );
    await expect(
      f.verification.verify(kind === "wrong" ? "other" : "fixture-token"),
    ).rejects.toMatchObject({ init: { status: 422, code: "auth.verification_token_invalid" } });
    expect(f.jobs).toEqual([]);
    expect(f.state.users[0]?.emailVerifiedAt).toBeNull();
  },
);
it("SMTP가 다섯 번 실패해도 시도마다 서로 다른 24시간 토큰을 commit하고 이전 토큰을 지운다", async () => {
  const f = fixture();
  f.addUser();
  f.addToken("reset-token", { purpose: "reset" });
  f.mailFailure = true;
  for (let i = 0; i < 5; i++)
    await expect(f.mails.sendVerification(user.id)).rejects.toThrow("SMTP 시험 실패");
  const tokens = f.messages.map((m) => /token=([A-Za-z0-9_-]+)/.exec(m.text)?.[1]);
  expect(new Set(tokens).size).toBe(5);
  expect(tokens.every((t) => typeof t === "string" && t.length === 43)).toBe(true);
  expect(f.state.tokens).toHaveLength(2);
  expect(f.state.tokens.find((t) => t.purpose === "verification")).toMatchObject({
    hash: createHash("sha256")
      .update(tokens[4] ?? "")
      .digest("hex"),
    expiresAt: new Date("2026-10-15T01:00:00Z"),
  });
  expect(f.events).toEqual(
    Array.from({ length: 5 }, () => ["begin", "lock", "commit", "smtp"]).flat(),
  );
  expect(f.messages[0]?.text).toContain("https://web.example.test/base/verify-email?token=");
});
it("재발송 뒤 이전 토큰은 거절하고 최신 메일의 토큰만 인증한다", async () => {
  const f = fixture();
  f.addUser();
  await f.mails.sendVerification(user.id);
  await f.mails.sendVerification(user.id);
  const token = (index: number) =>
    /token=([A-Za-z0-9_-]+)/.exec(f.messages[index]?.text ?? "")?.[1] ?? "";
  await expect(f.verification.verify(token(0))).rejects.toMatchObject({ init: { status: 422 } });
  await f.verification.verify(token(1));
  expect(f.state.users[0]?.emailVerifiedAt).toEqual(at);
});
it.each(["ko", "en"])(
  "%s 환영 메일은 commit 뒤 이름을 이스케이프하고 토큰을 만들지 않는다",
  async (locale) => {
    const f = fixture();
    f.addUser({ emailVerifiedAt: at, locale });
    await f.mails.sendWelcome(user.id);
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0]?.text).toContain("<민수>");
    expect(f.messages[0]?.html).toContain("&lt;민수&gt;");
    expect(f.state.tokens).toEqual([]);
    expect(f.events).toEqual(["begin", "commit", "smtp"]);
  },
);
it("이름이 없는 환영 메일도 조건문 없이 인사말을 보낸다", async () => {
  const f = fixture();
  f.addUser({ emailVerifiedAt: at, name: null });
  await f.mails.sendWelcome(user.id);
  expect(f.messages[0]?.text).toContain("안녕하세요");
  expect(f.messages[0]?.text).not.toContain("null");
});
it.each(["missing", "verified", "deactivated", "email-less"])(
  "인증 잡은 실행 때 다시 읽고 %s 대상에게 보내지 않는다",
  async (kind) => {
    const f = fixture();
    if (kind !== "missing")
      f.addUser(
        kind === "verified"
          ? { emailVerifiedAt: at }
          : kind === "email-less"
            ? { email: null }
            : { status: "deactivated" },
      );
    await f.mails.sendVerification(user.id);
    expect(f.messages).toEqual([]);
    expect(f.state.tokens).toEqual([]);
  },
);
it("미인증 대상에게 환영 메일을 보내지 않는다", async () => {
  const f = fixture();
  f.addUser();
  await f.mails.sendWelcome(user.id);
  expect(f.messages).toEqual([]);
});
