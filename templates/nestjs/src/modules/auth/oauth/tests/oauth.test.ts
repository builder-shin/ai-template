import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { settings } from "../../../../core/http/tests/fixtures.js";
import { linkAccount, verifiesCodeChallenge } from "../../index.js";
import { oauthFixture, start, verifiedIdentity, FRONT, CHALLENGE, VERIFIER } from "./fixtures.js";
const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
it("허용하지 않은 redirectUri는 400 invalid_query다", async () => {
  const f = oauthFixture();
  await expect(
    f.service.authorize("google", {
      redirectUri: "https://evil.example/cb",
      codeChallenge: CHALLENGE,
    }),
  ).rejects.toMatchObject({
    init: {
      status: 400,
      code: "jsonapi.invalid_query",
      title: "Invalid query",
      source: { parameter: "redirectUri" },
    },
  });
  expect(f.memory.values.size).toBe(0);
});
it.each(["", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "="])(
  "잘못된 codeChallenge 값 %s로 상태를 만들지 않는다",
  async (codeChallenge) => {
    const f = oauthFixture();
    await expect(
      f.service.authorize("google", { redirectUri: FRONT, codeChallenge }),
    ).rejects.toMatchObject({ init: { status: 400, source: { parameter: "codeChallenge" } } });
    expect(f.memory.values.size).toBe(0);
  },
);
it("인가는 프론트 challenge와 별도의 제공자 verifier를 10분 저장한다", async () => {
  const f = oauthFixture();
  const authorize = vi.spyOn(f.client, "authorizeUrl");
  const state = await start(f);
  const entry = [...f.memory.values.values()][0];
  expect(entry?.expires).toBe(600);
  const saved = JSON.parse(entry?.value ?? "{}") as {
    verifier: string;
    codeChallenge: string;
    provider: string;
    redirectUri: string;
  };
  expect(saved).toMatchObject({ provider: "google", redirectUri: FRONT, codeChallenge: CHALLENGE });
  expect(saved.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
  expect(saved.verifier).not.toBe(VERIFIER);
  expect(authorize).toHaveBeenCalledWith("google", {
    state,
    codeChallenge: s256(saved.verifier),
    redirectUri: `${settings.API_URL.replace(/\/$/, "")}/api/v1/oauth/google/callback`,
  });
  await f.service.callback("google", { state, code: "provider-code" });
  expect(f.exchanges[0]).toEqual({
    provider: "google",
    code: "provider-code",
    verifier: saved.verifier,
  });
});
it.each(["누락", "만료", "다른 제공자", "재사용"])(
  "state가 %s 상태면 400이며 한 번 소비한다",
  async (kind) => {
    const f = oauthFixture();
    const state = kind === "누락" ? undefined : await start(f);
    if (kind === "만료") f.memory.advance(600);
    if (kind === "재사용") await f.service.callback("google", { state, error: "access_denied" });
    await expect(
      f.service.callback(kind === "다른 제공자" ? "kakao" : "google", {
        state,
        code: "provider-code",
      }),
    ).rejects.toMatchObject({
      init: {
        status: 400,
        code: "jsonapi.invalid_query",
        title: "Invalid query",
        source: { parameter: "state" },
      },
    });
    if (kind === "다른 제공자")
      await expect(
        f.service.callback("google", { state, code: "provider-code" }),
      ).rejects.toMatchObject({ init: { status: 400 } });
  },
);
it.each([
  ["access_denied", "auth.oauth_denied"],
  ["server_error", "auth.oauth_failed"],
] as const)("제공자 오류 %s 발생 시 프론트에 %s로 보낸다", async (error, expected) => {
  const f = oauthFixture();
  const state = await start(f);
  expect(
    new URL(await f.service.callback("google", { state, error })).searchParams.get("error"),
  ).toBe(expected);
  expect(f.data.users).toEqual([]);
});
it.each(["코드 없음", "교환 실패", "조회 실패", "신원 오류", "저장 실패"])(
  "콜백 조건 %s에서 프론트 oauth_failed이며 코드를 만들지 않는다",
  async (kind) => {
    const f = oauthFixture();
    const state = await start(f);
    f.exchangeFailure = kind === "교환 실패";
    f.profileFailure = kind === "조회 실패";
    f.otherFailure = kind === "저장 실패";
    if (kind === "신원 오류") f.profile = {};
    const url = new URL(
      await f.service.callback("google", {
        state,
        ...(kind === "코드 없음" ? {} : { code: "provider-code" }),
      }),
    );
    expect(url.searchParams.get("error")).toBe("auth.oauth_failed");
    expect(url.searchParams.has("code")).toBe(false);
    expect(f.memory.values.size).toBe(0);
  },
);
it("검증된 이메일은 같은 이메일 계정에 연결하고 인증된 비밀번호를 보존한다", async () => {
  const f = oauthFixture();
  const user = f.addUser();
  expect(
    await f.unit.run((tx) => linkAccount(tx, "google", verifiedIdentity("ADA@example.com"), "en")),
  ).toEqual({ userId: user.id, status: "active" });
  expect(f.data.users).toHaveLength(1);
  expect(f.data.users[0]?.passwordHash).toBe("fixture-password-hash");
  expect(f.data.links[0]).toMatchObject({ userId: user.id, provider: "google", subject: "g1" });
});
it("검증된 이메일은 선점 가입의 비밀번호를 지우고 인증을 완료한다", async () => {
  const f = oauthFixture();
  const user = f.addUser({ emailVerifiedAt: null });
  const linked = await f.unit.run((tx) => linkAccount(tx, "google", verifiedIdentity(), "ko"));
  expect(linked.userId).toBe(user.id);
  expect(f.data.users[0]).toMatchObject({
    passwordHash: null,
    emailVerifiedAt: expect.any(Date) as unknown,
  });
});
it("처음 검증된 이메일은 비밀번호 없는 인증 회원과 member 역할을 만든다", async () => {
  const f = oauthFixture();
  const linked = await f.unit.run((tx) => linkAccount(tx, "google", verifiedIdentity(), "en"));
  expect(f.data.users[0]).toMatchObject({
    id: linked.userId,
    email: "ada@example.com",
    emailVerifiedAt: expect.any(Date) as unknown,
    passwordHash: null,
    name: "Ada",
    locale: "en",
  });
  expect(f.data.assignments).toEqual([{ userId: linked.userId, roleId: "member-role" }]);
});
it.each(["kakao", "naver"] as const)(
  "미검증 %s 이메일은 같은 이메일 계정에 연결하거나 저장하지 않는다",
  async (provider) => {
    const f = oauthFixture();
    const existing = f.addUser();
    const linked = await f.unit.run((tx) =>
      linkAccount(tx, provider, { ...verifiedIdentity(), emailVerified: false }, "ko"),
    );
    expect(linked.userId).not.toBe(existing.id);
    expect(f.data.users.find((u) => u.id === linked.userId)).toMatchObject({
      email: null,
      emailVerifiedAt: null,
      passwordHash: null,
    });
    expect(f.data.links[0]?.email).toBeNull();
  },
);
it("이메일과 이름이 없는 신원은 null 속성의 계정을 만든다", async () => {
  const f = oauthFixture();
  await f.unit.run((tx) =>
    linkAccount(
      tx,
      "kakao",
      { subject: "k1", email: null, emailVerified: false, name: null },
      "ko",
    ),
  );
  expect(f.data.users[0]).toMatchObject({ email: null, name: null, emailVerifiedAt: null });
});
it("이미 연결된 subject는 제공자가 다른 이메일을 보내도 같은 계정이다", async () => {
  const f = oauthFixture();
  const user = f.addUser();
  f.addLink(user.id);
  expect(
    await f.unit.run((tx) =>
      linkAccount(tx, "google", verifiedIdentity("other@example.com"), "ko"),
    ),
  ).toEqual({ userId: user.id, status: "active" });
  expect(f.data.users).toHaveLength(1);
  expect(f.data.links).toHaveLength(1);
});
it.each(["이메일", "연결"])("비활성 %s 계정은 콜백에서 account_deactivated다", async (kind) => {
  const f = oauthFixture();
  const user = f.addUser({ status: "deactivated", emailVerifiedAt: null });
  if (kind === "연결") {
    f.addLink(user.id);
    f.profile = { sub: "g1" };
  }
  const state = await start(f);
  const url = new URL(await f.service.callback("google", { state, code: "provider-code" }));
  expect(url.searchParams.get("error")).toBe("auth.account_deactivated");
  expect(url.searchParams.has("code")).toBe(false);
  expect(f.data.users[0]?.passwordHash).toBe("fixture-password-hash");
});
it("고유 제약 실패는 롤백 뒤 새 트랜잭션에서 한 번 재시도한다", async () => {
  const f = oauthFixture();
  f.uniqueFailures = 1;
  const state = await start(f);
  expect(
    new URL(await f.service.callback("google", { state, code: "provider-code" })).searchParams.has(
      "code",
    ),
  ).toBe(true);
  expect(f.events).toEqual(["begin", "rollback", "begin", "commit"]);
  expect(f.data.users).toHaveLength(1);
  expect(f.data.links).toHaveLength(1);
});
it("두 번째 고유 제약 실패는 다시 반복하지 않고 oauth_failed다", async () => {
  const f = oauthFixture();
  f.uniqueFailures = 2;
  const state = await start(f);
  expect(
    new URL(await f.service.callback("google", { state, code: "provider-code" })).searchParams.get(
      "error",
    ),
  ).toBe("auth.oauth_failed");
  expect(f.events).toEqual(["begin", "rollback", "begin", "rollback"]);
  expect(f.data.users).toEqual([]);
});
it("성공 콜백은 challenge에 묶인 60초 일회용 코드를 만든다", async () => {
  const f = oauthFixture();
  const state = await start(f);
  const url = new URL(await f.service.callback("google", { state, code: "provider-code" }));
  expect(url.origin + url.pathname).toBe(FRONT);
  expect(url.searchParams.has("error")).toBe(false);
  expect(url.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const entry = [...f.memory.values.values()][0];
  expect(entry?.expires).toBe(60);
  expect(JSON.parse(entry?.value ?? "{}") as unknown).toMatchObject({
    userId: f.data.users[0]?.id,
    provider: "google",
    codeChallenge: CHALLENGE,
  });
});
it("RFC7636 벡터와 128자 verifier를 검증하고 길이·문자·다른 challenge를 거절한다", () => {
  expect(verifiesCodeChallenge(CHALLENGE, VERIFIER)).toBe(true);
  const longest = "a".repeat(128);
  expect(verifiesCodeChallenge(s256(longest), longest)).toBe(true);
  for (const verifier of ["", "a".repeat(42), "a".repeat(129), "a".repeat(42) + "+"])
    expect(verifiesCodeChallenge(s256(verifier), verifier)).toBe(false);
  expect(verifiesCodeChallenge("", VERIFIER)).toBe(false);
  expect(verifiesCodeChallenge("a".repeat(43), VERIFIER)).toBe(false);
});
