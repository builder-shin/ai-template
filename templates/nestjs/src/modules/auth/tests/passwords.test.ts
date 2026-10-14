import "reflect-metadata";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../../core/security/passwords.js";
import { hashIdentifier } from "../../../core/security/identifier.js";
import { ApiError } from "../../../core/jsonapi/errors.js";
import {
  onSessionsRevoked,
  type SessionRevocation,
  purgeExpired,
  registerAuthJobs,
  AuthMails,
  PasswordsService,
} from "../index.js";
import { passwordFixture, now, userId, tokenHash } from "./password-fixtures.js";
import { testApp, mediaType, errorDocument } from "../../../core/http/tests/fixtures.js";
import { jobHandlers, periodicJobs } from "../../../core/jobs/names.js";
import { UnitOfWork } from "../../../core/db/unit-of-work.js";
import { registerDomain } from "../../registry.js";
import type { INestApplicationContext } from "@nestjs/common";
const oldPassword = "abcd\ud800xyz"; // betterleaks:allow 사유: 서로게이트를 검증하는 가짜 비밀번호
const newPassword = "new-password-123"; // betterleaks:allow 사유: 메모리 시험의 가짜 새 비밀번호
let oldHash: string;
beforeAll(async () => {
  oldHash = await hashPassword(oldPassword);
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
});
import { vi } from "vitest";
const principal = (sessionId: string) => ({ userId, sessionId, permissions: new Set<never>() });
it("재설정은 비밀번호·전체 세션·남은 토큰·감사를 함께 바꾸고 commit 뒤 폐기를 알린다", async () => {
  const f = passwordFixture();
  f.addUser({ passwordHash: oldHash });
  const first = f.addSession();
  const second = f.addSession();
  f.addToken("reset");
  f.addToken("remaining");
  f.addToken("verify", { purpose: "verification" });
  const revocations: SessionRevocation[] = [];
  const off = onSessionsRevoked((after, revocation) => {
    after(() => {
      expect(f.inTransaction).toBe(false);
      revocations.push(revocation);
    });
  });
  try {
    const document = await f.service.reset({ token: "reset", password: newPassword });
    expect(document).toMatchObject({
      data: { type: "password-resets", attributes: { createdAt: now.toISOString() } },
    });
    expect(await verifyPassword(f.state.users[0]?.passwordHash ?? "", newPassword)).toBe(true);
    expect(f.state.sessions.map((s) => s.revokedReason)).toEqual([
      "password_reset",
      "password_reset",
    ]);
    expect(f.state.tokens.map((t) => t.purpose)).toEqual(["verification"]);
    expect(f.state.audits).toEqual([
      { action: "user.password_reset", actorUserId: userId, meta: {} },
    ]);
    expect(revocations).toEqual([
      { userId, sessionIds: [first.id, second.id].sort(), reason: "password_reset" },
    ]);
  } finally {
    off();
  }
});
it.each([
  ["없는", {}],
  ["만료 경계", { expiresAt: now }],
  ["인증 목적", { purpose: "verification" as const }],
])("%s 재설정 토큰은 422이고 비밀번호·토큰을 바꾸지 않는다", async (kind, overrides) => {
  const f = passwordFixture();
  f.addUser({ passwordHash: oldHash });
  if (kind !== "없는") f.addToken("reset", overrides);
  const before = structuredClone(f.state);
  await expect(f.service.reset({ token: "reset", password: newPassword })).rejects.toMatchObject({
    init: {
      status: 422,
      code: "auth.verification_token_invalid",
      source: { pointer: "/data/attributes/token" },
    },
  });
  expect(f.state).toEqual(before);
});
it("재설정 토큰은 한 번만 소비하고 나머지 토큰도 다시 쓸 수 없다", async () => {
  const f = passwordFixture();
  f.addUser({ passwordHash: oldHash });
  f.addToken("first");
  f.addToken("second");
  await f.service.reset({ token: "first", password: newPassword });
  for (const token of ["first", "second"])
    await expect(f.service.reset({ token, password: newPassword })).rejects.toMatchObject({
      init: { status: 422, code: "auth.verification_token_invalid" },
    });
});
it("감사 실패는 재설정의 비밀번호·토큰·세션을 rollback하고 폐기를 발행하지 않는다", async () => {
  const f = passwordFixture();
  f.addUser({ passwordHash: oldHash });
  f.addToken("reset");
  f.addSession();
  f.failAudit = true;
  const before = structuredClone(f.state);
  const notifications: SessionRevocation[] = [];
  const off = onSessionsRevoked((after, r) => {
    after(() => {
      notifications.push(r);
    });
  });
  try {
    await expect(f.service.reset({ token: "reset", password: newPassword })).rejects.toThrow(
      "감사 저장 실패",
    );
    expect(f.state).toEqual(before);
    expect(notifications).toEqual([]);
  } finally {
    off();
  }
});
it("변경은 서로게이트 바이트를 검증하고 현재 세션만 유지하며 사용자 id 리밋과 감사를 남긴다", async () => {
  const f = passwordFixture();
  f.addUser({ passwordHash: oldHash });
  const current = f.addSession();
  const other = f.addSession();
  f.addToken("reset");
  const notifications: SessionRevocation[] = [];
  const off = onSessionsRevoked((after, r) => {
    after(() => {
      notifications.push(r);
    });
  });
  try {
    expect(
      await f.service.change(principal(current.id), { currentPassword: oldPassword, newPassword }),
    ).toMatchObject({
      data: { type: "password-changes", attributes: { createdAt: now.toISOString() } },
    });
    expect(await verifyPassword(f.state.users[0]?.passwordHash ?? "", newPassword)).toBe(true);
    expect(f.state.sessions.map((s) => [s.id, s.revokedReason])).toEqual([
      [current.id, null],
      [other.id, "password_changed"],
    ]);
    expect(f.state.tokens).toEqual([]);
    expect(f.limits).toEqual([["password_change.user", userId]]);
    expect(f.state.audits).toEqual([
      { action: "user.password_changed", actorUserId: userId, meta: {} },
    ]);
    expect(notifications).toEqual([{ userId, sessionIds: [other.id], reason: "password_changed" }]);
  } finally {
    off();
  }
});
it.each(["틀린", "대체 문자", "소셜 전용"])(
  "%s 현재 비밀번호는 Bearer 401이고 상태를 유지한다",
  async (kind) => {
    const f = passwordFixture();
    f.addUser({ passwordHash: kind === "소셜 전용" ? null : oldHash });
    const current = f.addSession();
    f.addToken("reset");
    const before = structuredClone(f.state);
    await expect(
      f.service.change(principal(current.id), {
        currentPassword: kind === "대체 문자" ? "abcd\ufffdxyz" : "wrong",
        newPassword,
      }),
    ).rejects.toMatchObject({
      init: {
        status: 401,
        code: "auth.invalid_credentials",
        headers: { "WWW-Authenticate": "Bearer" },
      },
    });
    expect(f.state).toEqual(before);
  },
);
it("사용자 변경 리밋이 막히면 트랜잭션과 해시 변경을 시작하지 않는다", async () => {
  const f = passwordFixture();
  f.limitFailure = new ApiError({
    status: 429,
    code: "rate_limit.exceeded",
    title: "한도를 넘었다",
  });
  await expect(
    f.service.change(principal("session"), { currentPassword: oldPassword, newPassword }),
  ).rejects.toMatchObject({ init: { status: 429 } });
  expect(f.events).toEqual([]);
  expect(f.limits).toEqual([["password_change.user", userId]]);
});
it.each(["member@example.com", "absent@example.com"])(
  "%s 요청은 같은 메일 리밋을 적용하고 계정이 있으면 commit 뒤 id만 큐에 넣는다",
  async (email) => {
    const f = passwordFixture();
    f.addUser();
    await f.service.request(email.toUpperCase(), "192.0.2.1");
    expect(f.limits).toEqual([
      ["mail.ip", "192.0.2.1"],
      ["mail.email", hashIdentifier(email, "password-fixture-identifier-key")],
    ]);
    expect(f.jobs).toEqual(
      email === "member@example.com"
        ? [{ name: "auth.send_reset_mail", data: { id: userId } }]
        : [],
    );
    expect(f.state.tokens).toEqual([]);
    expect(f.events.at(-1)).toBe(email === "member@example.com" ? "enqueue" : "commit");
  },
);
it("메일 리밋 실패는 사용자 조회와 큐 등록 전에 끝난다", async () => {
  const f = passwordFixture();
  f.limitFailure = new Error("메일 한도 초과");
  await expect(f.service.request("member@example.com", "ip")).rejects.toThrow("메일 한도 초과");
  expect(f.events).toEqual([]);
  expect(f.jobs).toEqual([]);
});
it.each(["ko", "en"])(
  "%s 재설정 잡은 한 시간 해시를 commit한 뒤 링크를 보내고 재시도마다 토큰을 바꾼다",
  async (locale) => {
    const f = passwordFixture();
    f.addUser({ locale });
    f.addToken("old");
    f.addToken("verify", { purpose: "verification" });
    f.failMail = true;
    await expect(f.mails.sendReset(userId)).rejects.toThrow("SMTP 시험 실패");
    const first = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(f.messages[0]?.text ?? "")?.[1];
    expect(first).toBeTruthy();
    f.failMail = false;
    await f.mails.sendReset(userId);
    const second = /reset-password\?token=([A-Za-z0-9_-]+)/.exec(f.messages[1]?.text ?? "")?.[1];
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(f.state.tokens.filter((t) => t.purpose === "reset")).toEqual([
      expect.objectContaining({
        tokenHash: tokenHash(second ?? ""),
        expiresAt: new Date("2026-10-14T02:00:00Z"),
      }),
    ]);
    expect(f.state.tokens.some((t) => t.tokenHash === tokenHash(first ?? ""))).toBe(false);
    expect(f.messages[1]?.text).toContain(
      `https://web.example.test/base/reset-password?token=${second ?? ""}`,
    );
    expect(f.messages[1]?.html).toContain("&lt;회원&gt;");
    expect(f.events.filter((e) => e === "commit" || e === "smtp")).toEqual([
      "commit",
      "smtp",
      "commit",
      "smtp",
    ]);
  },
);
it.each([null, "deactivated"])(
  "%s 이메일·비활성 계정은 재설정 잡에서 토큰과 메일을 만들지 않는다",
  async (value) => {
    const f = passwordFixture();
    f.addUser(value === null ? { email: null } : { status: value });
    await f.mails.sendReset(userId);
    expect(f.state.tokens).toEqual([]);
    expect(f.messages).toEqual([]);
  },
);
it("만료 정리는 경계의 만료·폐기 세션과 두 목적의 만료 토큰만 지운다", async () => {
  const f = passwordFixture();
  const keep = f.addSession();
  f.addSession({ expiresAt: now });
  f.addSession({ revokedAt: now, revokedReason: "logout" });
  f.addToken("reset-expired", { expiresAt: now });
  f.addToken("verify-expired", { expiresAt: now, purpose: "verification" });
  f.addToken("live");
  expect(await f.unit.run((tx) => purgeExpired(tx, now))).toEqual({ sessions: 2, tokens: 2 });
  expect(f.state.sessions.map((s) => s.id)).toEqual([keep.id]);
  expect(f.state.tokens.map((t) => t.tokenHash)).toEqual([tokenHash("live")]);
});
it("만료 refresh 토큰은 활성 세션에서도 지우고 살아 있는 refresh는 남긴다", async () => {
  const f = passwordFixture();
  const session = f.addSession();
  f.addRefresh(session.id, now);
  f.addRefresh(session.id, new Date("2026-10-15T01:00:00Z"));
  f.addToken("expired", { expiresAt: now });
  expect(await f.unit.run((tx) => purgeExpired(tx, now))).toEqual({ sessions: 0, tokens: 2 });
  expect(f.state.refresh).toHaveLength(1);
  expect(f.state.refresh[0]?.expiresAt).toEqual(new Date("2026-10-15T01:00:00Z"));
  expect(f.state.sessions.map((s) => s.id)).toEqual([session.id]);
});
it("재설정 요청 HTTP는 본문 없는 202를 내보낸다", async () => {
  const f = passwordFixture();
  const { app, http } = await testApp([]);
  app.get(PasswordsService).request = f.service.request.bind(f.service);
  const response = await http
    .post("/api/v1/password-reset-requests")
    .set("Content-Type", mediaType)
    .send({
      data: { type: "password-reset-requests", attributes: { email: "absent@example.com" } },
    });
  expect(response.status).toBe(202);
  expect(response.text).toBe("");
});
it("재설정 HTTP의 짧은 새 비밀번호는 422 pointer를 내보낸다", async () => {
  const { http } = await testApp([]);
  const shortPassword = "short"; // betterleaks:allow 사유: 길이 검증용 가짜 비밀번호
  const response = await http
    .post("/api/v1/password-resets")
    .set("Content-Type", mediaType)
    .send({
      data: { type: "password-resets", attributes: { token: "token", password: shortPassword } },
    });
  expect(response.status).toBe(422);
  expect(errorDocument(response.text).errors[0]).toMatchObject({
    code: "validation.too_short",
    source: { pointer: "/data/attributes/password" },
  });
});
it("비밀번호 변경 HTTP는 인증 없이 Bearer 401을 내보낸다", async () => {
  const { http } = await testApp([]);
  const response = await http
    .post("/api/v1/password-changes")
    .set("Content-Type", mediaType)
    .send({ data: { type: "password-changes", attributes: { currentPassword: "", newPassword } } });
  expect(response.status).toBe(401);
  expect(response.headers["www-authenticate"]).toBe("Bearer");
});
it("도메인 등록을 반복해도 UTC 매일 3시 만료 잡은 하나이고 실제 handler가 정리한다", async () => {
  const f = passwordFixture();
  f.addSession({ expiresAt: now });
  const app = {
    get: (token: unknown) =>
      token === UnitOfWork
        ? f.unit
        : token === AuthMails
          ? f.mails
          : { register: () => {}, load: () => {}, onModuleDestroy: () => {} },
  } as unknown as INestApplicationContext;
  registerAuthJobs(app);
  // 도메인의 실시간 등록은 자체 소비자를 가지므로 이 시험에서는 해당 경계만 대체한다.
  const realtime = await import("../../realtime/index.js");
  const spy = vi.spyOn(realtime, "registerRealtime").mockImplementation(() => {});
  try {
    registerDomain(app);
    registerDomain(app);
    expect([...periodicJobs.values()].filter((j) => j.name === "auth.purge_expired")).toEqual([
      { name: "auth.purge_expired", pattern: "0 3 * * *", tz: "UTC" },
    ]);
    const handler = jobHandlers.get("auth.purge_expired");
    expect(handler).toBeTypeOf("function");
    await handler?.({ id: "auth.purge_expired" }, { attempt: 1 });
    expect(f.state.sessions).toEqual([]);
    const mail = jobHandlers.get("auth.send_reset_mail");
    expect(mail).toBeTypeOf("function");
  } finally {
    spy.mockRestore();
    periodicJobs.delete("auth.purge_expired");
    jobHandlers.delete("auth.purge_expired");
    jobHandlers.delete("auth.send_reset_mail");
  }
});
