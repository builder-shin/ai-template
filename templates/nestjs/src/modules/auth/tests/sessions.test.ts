import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import * as passwords from "../../../core/security/passwords.js";
import { verifyAccessToken, signAccessToken } from "../../../core/security/jwt.js";
import type { Principal } from "../../../core/security/principal.js";
import { parseQuery } from "../../../core/jsonapi/query.js";
import { ApiError } from "../../../core/jsonapi/errors.js";
import { onSessionsRevoked, type SessionRevocation } from "../index.js";
import { sessionFixture, now, userId, settings } from "./session-fixtures.js";
vi.mock("../../../core/security/passwords.js", { spy: true });
const input = { email: " Member@Example.COM ", password: "password-123" }; // betterleaks:allow 사유: 로그인 단위 시험의 가짜 비밀번호
const wrongPassword = "wrong-password"; // betterleaks:allow 사유: 실패 로그인 단위 시험의 가짜 비밀번호
let hash: string;
let revocations: SessionRevocation[] = [];
let current: ReturnType<typeof sessionFixture>;
beforeAll(async () => {
  hash = await passwords.hashPassword(input.password);
  onSessionsRevoked((afterCommit, event) => {
    afterCommit(() => {
      if (current.inTransaction) throw new Error("폐기 이벤트가 commit 전에 실행됐다");
      revocations.push(event);
    });
  });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  revocations = [];
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});
function fixture(overrides: Parameters<ReturnType<typeof sessionFixture>["addUser"]>[0] = {}) {
  current = sessionFixture();
  current.addUser({ passwordHash: hash, ...overrides });
  return current;
}
function principal(sessionId: string): Principal {
  return { userId, sessionId, permissions: new Set() };
}
const error = (code: string, status = 401) => ({
  init: { status, code, ...(status === 401 ? { headers: { "WWW-Authenticate": "Bearer" } } : {}) },
});
it("비밀번호 로그인은 30일 세션과 해시 refresh를 만들고 성공 감사와 마지막 로그인을 함께 commit한다", async () => {
  const f = fixture();
  const result = await f.service.createWithPassword(input, { ip: "192.0.2.1", userAgent: "기기" });
  expect(result.data).toMatchObject({
    type: "sessions",
    attributes: {
      userAgent: "기기",
      createdAt: "2026-10-14T01:00:00.000Z",
      lastUsedAt: "2026-10-14T01:00:00.000Z",
      current: true,
      accessTokenExpiresAt: "2026-10-14T01:15:00.000Z",
      refreshTokenExpiresAt: "2026-11-13T01:00:00.000Z",
    },
    relationships: { user: { data: { type: "users", id: userId } } },
  });
  expect(f.state.sessions[0]).toMatchObject({
    authenticatedAt: now,
    expiresAt: new Date("2026-11-13T01:00:00Z"),
    revokedAt: null,
  });
  expect(f.state.refresh[0]?.tokenHash).toBe(
    createHash("sha256").update(result.data.attributes.refreshToken).digest("hex"),
  );
  expect(JSON.stringify(f.state)).not.toContain(result.data.attributes.refreshToken);
  await expect(
    verifyAccessToken(result.data.attributes.accessToken, settings.JWT_SECRET, now),
  ).resolves.toMatchObject({ userId, sessionId: result.data.id });
  expect(f.state.audits).toEqual([
    {
      action: "session.login_succeeded",
      actorUserId: userId,
      targetType: "users",
      targetId: userId,
      meta: {},
    },
  ]);
  expect(f.state.loginAt).toEqual(now);
  expect(f.events).toEqual([
    "begin",
    "lock:user",
    "find:user",
    "session:create",
    "audit",
    "commit",
  ]);
  expect(f.limits).toEqual([
    ["login.ip", "192.0.2.1"],
    [
      "login.identifier",
      createHmac("sha256", settings.IDENTIFIER_HASH_SECRET)
        .update("member@example.com")
        .digest("hex"),
    ],
  ]);
});
it("비밀번호 로그인은 검증 뒤 사용자 잠금을 얻고 다시 읽은 해시로 세션을 만든다", async () => {
  const f = fixture();
  vi.mocked(passwords.verifyPassword).mockImplementationOnce(() => {
    f.events.push("verify");
    return Promise.resolve(true);
  });
  await f.service.createWithPassword(input, { ip: "ip" });
  expect(f.events).toEqual([
    "begin",
    "verify",
    "lock:user",
    "find:user",
    "session:create",
    "audit",
    "commit",
  ]);
});
it("잠금을 기다리는 동안 해시가 바뀌면 401이고 세션을 만들지 않는다", async () => {
  const f = fixture();
  f.userChangeOnLock = { passwordHash: "changed-hash" };
  await expect(f.service.createWithPassword(input, { ip: "ip" })).rejects.toMatchObject(
    error("auth.invalid_credentials"),
  );
  expect(f.state.sessions).toEqual([]);
  expect(f.state.audits).toEqual([expect.objectContaining({ action: "session.login_failed" })]);
  expect(f.events).toEqual(["begin", "lock:user", "find:user", "audit", "commit"]);
});
it("잠금을 기다리는 동안 계정이 비활성화되면 401이고 세션을 만들지 않는다", async () => {
  const f = fixture();
  f.userChangeOnLock = { status: "deactivated" };
  await expect(f.service.createWithPassword(input, { ip: "ip" })).rejects.toMatchObject(
    error("auth.invalid_credentials"),
  );
  expect(f.state.sessions).toEqual([]);
});
it.each(["없는 계정", "틀린 비밀번호", "소셜 전용"])(
  "%s 로그인은 같은 401과 식별자 해시 감사를 commit한다",
  async (kind) => {
    const f =
      kind === "없는 계정"
        ? (current = sessionFixture())
        : fixture(kind === "소셜 전용" ? { passwordHash: null } : {});
    await expect(
      f.service.createWithPassword({ ...input, password: wrongPassword }, { ip: "ip" }),
    ).rejects.toMatchObject(error("auth.invalid_credentials"));
    expect(f.state.sessions).toEqual([]);
    expect(f.state.audits).toEqual([
      {
        action: "session.login_failed",
        identifierHash: createHmac("sha256", settings.IDENTIFIER_HASH_SECRET)
          .update("member@example.com")
          .digest("hex"),
        meta: {},
      },
    ]);
    expect(f.events).toEqual(["begin", "audit", "commit"]);
    if (kind !== "틀린 비밀번호")
      expect(passwords.dummyVerify).toHaveBeenCalledWith("wrong-password");
  },
);
it.each([
  [{ emailVerifiedAt: null }, "auth.email_not_verified"],
  [{ status: "deactivated" }, "auth.account_deactivated"],
])("자격이 맞아도 제한된 계정은 403과 실패 감사다: %j", async (overrides, code) => {
  const f = fixture(overrides);
  await expect(f.service.createWithPassword(input, { ip: "ip" })).rejects.toMatchObject(
    error(code, 403),
  );
  expect(f.state.audits).toHaveLength(1);
  expect(f.state.sessions).toHaveLength(0);
  expect(f.events.at(-1)).toBe("commit");
});
it("제한 실패는 비밀번호 검증이나 DB 트랜잭션을 시작하지 않는다", async () => {
  const f = fixture();
  const failure = new ApiError({ status: 429, code: "rate_limit.exceeded", title: "제한" });
  f.limitFailure = failure;
  await expect(f.service.createWithPassword(input, { ip: "ip" })).rejects.toBe(failure);
  expect(f.events).toEqual([]);
  expect(passwords.verifyPassword).not.toHaveBeenCalled();
});
it("감사 저장 실패는 세션과 refresh와 마지막 로그인을 함께 rollback한다", async () => {
  const f = fixture();
  f.failAudit = true;
  await expect(f.service.createWithPassword(input, { ip: "ip" })).rejects.toThrow("감사 저장 실패");
  expect(f.state.sessions).toEqual([]);
  expect(f.state.refresh).toEqual([]);
  expect(f.state.loginAt).toBeNull();
  expect(f.events.at(-1)).toBe("rollback");
});
it("refresh는 세션 잠금 뒤 회전하고 authenticatedAt은 바꾸지 않는다", async () => {
  const f = fixture();
  const first = await f.service.createWithPassword(input, { ip: "ip" });
  vi.setSystemTime(new Date("2026-10-14T02:00:00Z"));
  const next = await f.service.refresh(first.data.attributes.refreshToken);
  expect(next.data.id).toBe(first.data.id);
  expect(next.data.attributes.refreshToken).not.toBe(first.data.attributes.refreshToken);
  expect(f.state.sessions[0]).toMatchObject({
    authenticatedAt: now,
    lastUsedAt: new Date("2026-10-14T02:00:00Z"),
    expiresAt: new Date("2026-11-13T02:00:00Z"),
  });
  expect(f.state.refresh).toHaveLength(2);
  expect(f.state.refresh[0]?.usedAt).toEqual(new Date("2026-10-14T02:00:00Z"));
  expect(f.events.slice(-6)).toEqual([
    "begin",
    "findRefresh",
    "lock",
    "findRefresh",
    "find:user",
    "commit",
  ]);
});
it("첫 조회 뒤 잠금을 기다리는 동안 소비된 refresh는 재조회해 재사용 401로 거절한다", async () => {
  const f = fixture();
  const login = await f.service.createWithPassword(input, { ip: "ip" });
  f.events.length = 0;
  f.consumeRefreshOnLock = true;
  await expect(f.service.refresh(login.data.attributes.refreshToken)).rejects.toMatchObject(
    error("auth.refresh_token_reused"),
  );
  expect(f.events).toEqual(["begin", "findRefresh", "lock", "findRefresh", "commit"]);
  expect(f.state.sessions[0]?.revokedReason).toBe("refresh_token_reused");
  expect(f.state.refresh).toHaveLength(1);
});
it("사용한 refresh는 폐기를 commit한 뒤 재사용 401이고 회전된 두 토큰도 즉시 401이다", async () => {
  const f = fixture();
  const first = await f.service.createWithPassword(input, { ip: "ip" });
  const next = await f.service.refresh(first.data.attributes.refreshToken);
  await expect(f.service.refresh(first.data.attributes.refreshToken)).rejects.toMatchObject(
    error("auth.refresh_token_reused"),
  );
  expect(f.state.sessions[0]).toMatchObject({
    revokedAt: now,
    revokedReason: "refresh_token_reused",
  });
  expect(f.events.at(-1)).toBe("commit");
  expect(revocations).toEqual([
    { userId, sessionIds: [first.data.id], reason: "refresh_token_reused" },
  ]);
  await expect(f.service.refresh(next.data.attributes.refreshToken)).rejects.toMatchObject(
    error("auth.token_invalid"),
  );
  await expect(
    f.resolver.resolve(`Bearer ${next.data.attributes.accessToken}`),
  ).rejects.toMatchObject(error("auth.token_invalid"));
  expect(revocations).toHaveLength(1);
});
it.each(["없는 토큰", "만료 토큰", "만료 세션"])(
  "%s refresh는 폐기 없이 token_invalid다",
  async (kind) => {
    const f = fixture();
    const login = await f.service.createWithPassword(input, { ip: "ip" });
    const token = f.state.refresh[0];
    const session = f.state.sessions[0];
    if (!token || !session) throw new Error("로그인 상태가 없다");
    if (kind === "만료 토큰") token.expiresAt = now;
    if (kind === "만료 세션") session.expiresAt = now;
    await expect(
      f.service.refresh(kind === "없는 토큰" ? "missing" : login.data.attributes.refreshToken),
    ).rejects.toMatchObject(error("auth.token_invalid"));
    expect(revocations).toEqual([]);
    expect(f.state.sessions[0]?.revokedAt).toBeNull();
  },
);
it("목록은 활성 내 세션만 정렬·페이지하며 토큰을 노출하지 않는다", async () => {
  const f = fixture();
  const first = f.addSession({ createdAt: new Date("2026-10-12T01:00:00Z") });
  const next = f.addSession();
  f.addSession({ revokedAt: now });
  f.addSession({ expiresAt: now });
  f.addSession({ userId: "other" });
  const search = "sort=-createdAt&page[size]=1&page[number]=2";
  const query = parseQuery(search, {
    sort: ["createdAt", "lastUsedAt"],
    page: { defaultSize: 20, maxSize: 100 },
  });
  const result = await f.service.list(principal(next.id), query, search);
  expect(result.data).toHaveLength(1);
  expect(result.data[0]).toMatchObject({ id: first.id, attributes: { current: false } });
  expect(result.meta.page).toEqual({ number: 2, size: 1, total: 2, totalPages: 2 });
  expect(result.links).toEqual({
    first: "/api/v1/sessions?sort=-createdAt&page%5Bsize%5D=1&page%5Bnumber%5D=1",
    prev: "/api/v1/sessions?sort=-createdAt&page%5Bsize%5D=1&page%5Bnumber%5D=1",
    next: null,
    last: "/api/v1/sessions?sort=-createdAt&page%5Bsize%5D=1&page%5Bnumber%5D=2",
  });
  expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken|tokenHash/);
});
it("세션 목록 링크는 원문의 희소 필드를 모든 페이지에 유지한다", async () => {
  const f = fixture();
  const session = f.addSession();
  f.addSession();
  const search = "fields[sessions]=current&page[size]=1";
  const query = parseQuery(search, {
    fields: { sessions: ["current"] },
    page: { defaultSize: 20, maxSize: 100 },
  });
  const result = await f.service.list(principal(session.id), query, search);
  for (const link of Object.values(result.links))
    if (typeof link === "string")
      expect(new URL(link, "https://api.example.test").searchParams.get("fields[sessions]")).toBe(
        "current",
      );
});
it("계정 삭제는 만료된 미폐기 세션도 id 순서로 잠그고 폐기한다", async () => {
  const f = fixture();
  const high = f.addSession({ id: "z-session", expiresAt: now });
  const low = f.addSession({ id: "a-session" });
  f.addSession({ id: "revoked", revokedAt: now });
  const lock = vi.spyOn(f.repository, "lock");
  await f.unit.run((tx, after) => f.service.revokeForAccountDeletion(tx, after, userId, now));
  expect(lock.mock.calls.map(([, id]) => id)).toEqual([low.id, high.id]);
  expect(
    f.state.sessions
      .filter((s) => s.revokedReason === "account_deleted")
      .map((s) => s.id)
      .sort(),
  ).toEqual([low.id, high.id]);
  expect(revocations).toEqual([
    { userId, sessionIds: [low.id, high.id], reason: "account_deleted" },
  ]);
});
it("현재 로그아웃은 commit 뒤 이벤트를 보내고 기존 access를 거절한다", async () => {
  const f = fixture();
  const login = await f.service.createWithPassword(input, { ip: "ip" });
  await f.service.revokeCurrent(principal(login.data.id));
  expect(revocations).toEqual([{ userId, sessionIds: [login.data.id], reason: "logout" }]);
  await expect(
    f.resolver.resolve(`Bearer ${login.data.attributes.accessToken}`),
  ).rejects.toMatchObject(error("auth.token_invalid"));
});
it("다른 사용자의 세션과 없는 id는 404이고 내 폐기 세션 재삭제는 성공이다", async () => {
  const f = fixture();
  const owned = f.addSession();
  const other = f.addSession({ userId: "other" });
  for (const id of [other.id, "missing"])
    await expect(f.service.revoke(principal(owned.id), id)).rejects.toMatchObject(
      error("resource.not_found", 404),
    );
  await f.service.revoke(principal(owned.id), owned.id);
  await f.service.revoke(principal(owned.id), owned.id);
  expect(f.state.sessions.find((s) => s.id === owned.id)?.revokedReason).toBe("revoked");
  expect(revocations).toHaveLength(1);
});
it.each(["others", "all"] as const)(
  "%s 전체 폐기는 실제 개수와 감사를 commit하고 이벤트를 보낸다",
  async (scope) => {
    const f = fixture();
    const own = f.addSession();
    const second = f.addSession();
    f.addSession({ revokedAt: now });
    f.addSession({ expiresAt: now });
    const count =
      scope === "others"
        ? await f.service.revokeOthers(principal(own.id))
        : await f.service.revokeAll(principal(own.id));
    expect(count).toBe(scope === "others" ? 1 : 2);
    expect(f.state.audits).toEqual([
      { action: "session.all_revoked", actorUserId: userId, meta: { scope, revokedCount: count } },
    ]);
    expect(revocations).toHaveLength(1);
    expect(revocations[0]).toMatchObject({ userId, reason: "revoked" });
    expect([...(revocations[0]?.sessionIds ?? [])].sort()).toEqual(
      (scope === "others" ? [second.id] : [own.id, second.id]).sort(),
    );
  },
);
it("전체 폐기 감사 실패는 폐기와 이벤트를 모두 남기지 않는다", async () => {
  const f = fixture();
  const own = f.addSession();
  f.addSession();
  f.failAudit = true;
  await expect(f.service.revokeOthers(principal(own.id))).rejects.toThrow("감사 저장 실패");
  expect(f.state.sessions.every((s) => s.revokedAt === null)).toBe(true);
  expect(revocations).toEqual([]);
});
it("주체는 실제 세션과 활성 계정의 최신 권한을 계산한다", async () => {
  const f = fixture();
  const session = f.addSession();
  const token = await signAccessToken({ userId, sessionId: session.id }, settings.JWT_SECRET, now);
  await expect(f.resolver.resolve(`Bearer ${token}`)).resolves.toEqual({
    userId,
    sessionId: session.id,
    permissions: new Set(["posts:create"]),
  });
  await expect(f.resolver.resolve(undefined)).resolves.toBeUndefined();
});
it.each(["없는 세션", "다른 사용자", "폐기", "만료", "비활성"])(
  "주체는 %s 상태를 거절한다",
  async (kind) => {
    const f = fixture(kind === "비활성" ? { status: "deactivated" } : {});
    const session = f.addSession({
      ...(kind === "다른 사용자" ? { userId: "other" } : {}),
      ...(kind === "폐기" ? { revokedAt: now } : {}),
      ...(kind === "만료" ? { expiresAt: now } : {}),
    });
    const token = await signAccessToken(
      { userId, sessionId: kind === "없는 세션" ? "missing" : session.id },
      settings.JWT_SECRET,
      now,
    );
    await expect(f.resolver.resolve(`Bearer ${token}`)).rejects.toMatchObject(
      error("auth.token_invalid"),
    );
  },
);
it.each(["", "Basic abc", "Bearer", "Bearer a b"])(
  "잘못된 Authorization 형식 %s는 거절한다",
  async (header) => {
    const f = fixture();
    await expect(f.resolver.resolve(header)).rejects.toMatchObject(error("auth.token_invalid"));
    expect(f.events).toEqual([]);
  },
);
