import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import { sessionFixture, sessionDocument, errorCode } from "./session-fixture.js";
import { getState } from "./state.js";
type Provider = "google" | "kakao" | "naver";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
function claims(provider: Provider, subject: string, email: string, verified: boolean) {
  if (provider === "kakao")
    return {
      id: subject,
      kakao_account: {
        email,
        is_email_valid: verified,
        is_email_verified: verified,
        profile: { nickname: "Social User" },
      },
    };
  if (provider === "naver") return { response: { id: subject, email, name: "Social User" } };
  return { email, email_verified: verified, hd: "example.com", name: "Social User" };
}
async function social(
  f: Awaited<ReturnType<typeof sessionFixture>>,
  provider: Provider,
  email: string,
  verified: boolean,
  subject = randomUUID(),
) {
  const redirectUri = getState().settings.OAUTH_REDIRECT_URIS[0];
  if (!redirectUri) throw new Error("프론트 콜백 주소가 없다");
  const authorize = await f.http
    .get(`/api/v1/oauth/${provider}/authorize`)
    .query({ redirectUri, codeChallenge: CHALLENGE });
  expect(authorize.status).toBe(302);
  expect(authorize.text).toBe("");
  const location = authorize.headers.location as string;
  // CI의 mock-oauth2-server에만 ASCII claims를 보낸다.
  const providerResponse = await fetch(location, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({
      username: subject,
      claims: JSON.stringify(claims(provider, subject, email, verified)),
    }),
  });
  expect(providerResponse.status).toBe(302);
  const returned = providerResponse.headers.get("location");
  if (!returned) throw new Error("제공자 콜백이 없다");
  const callback = await f.http
    .get(`/api/v1/oauth/${provider}/callback`)
    .query(Object.fromEntries(new URL(returned).searchParams));
  expect(callback.status).toBe(302);
  expect(callback.text).toBe("");
  const url = new URL(callback.headers.location as string);
  expect(url.origin + url.pathname).toBe(
    new URL(redirectUri).origin + new URL(redirectUri).pathname,
  );
  return url.searchParams;
}
async function exchange(
  f: Awaited<ReturnType<typeof sessionFixture>>,
  query: URLSearchParams,
  verifier = VERIFIER,
) {
  const code = query.get("code");
  if (!code) throw new Error("로그인 코드가 없다");
  return f.post({ grantType: "oauthCode", code, codeVerifier: verifier });
}
it.each(["google", "kakao", "naver"] as const)(
  "%s 모의 제공자는 authorize→callback→oauthCode로 member 세션을 만든다",
  async (provider) => {
    const f = await sessionFixture();
    const query = await social(f, provider, "social@example.com", true);
    const response = await exchange(f, query);
    expect(response.status).toBe(201);
    const session = sessionDocument(response.text);
    const stored = await f.unit.run((tx) =>
      tx.session.findUniqueOrThrow({
        where: { id: session.data.id },
        include: { user: { include: { roles: { include: { role: true } } } } },
      }),
    );
    expect(stored.user.name).toBe("Social User");
    expect(stored.user.passwordHash).toBeNull();
    expect(stored.user.roles.map((assignment) => assignment.role.name)).toEqual(["member"]);
    expect(stored.user.email).toBe(provider === "naver" ? null : "social@example.com");
    const reused = await exchange(f, query);
    expect(reused.status).toBe(401);
    expect(errorCode(reused.text)).toBe("auth.oauth_code_invalid");
    expect(reused.headers["www-authenticate"]).toBe("Bearer");
  },
);
it.each(["kakao", "naver"] as const)(
  "%s 미검증 이메일은 기존 계정에 연결하지 않는다",
  async (provider) => {
    const f = await sessionFixture();
    const query = await social(f, provider, f.user.email ?? "", provider === "naver");
    const response = await exchange(f, query);
    expect(response.status).toBe(201);
    const session = sessionDocument(response.text);
    const stored = await f.unit.run((tx) =>
      tx.session.findUniqueOrThrow({ where: { id: session.data.id }, include: { user: true } }),
    );
    expect(stored.user.id).not.toBe(f.user.id);
    expect(stored.user.email).toBeNull();
  },
);
it("검증된 제공자 이메일은 선점 가입의 비밀번호를 제거하고 인증한다", async () => {
  const f = await sessionFixture();
  await f.unit.run((tx) =>
    tx.user.update({ where: { id: f.user.id }, data: { emailVerifiedAt: null } }),
  );
  const query = await social(f, "google", f.user.email ?? "", true);
  expect((await exchange(f, query)).status).toBe(201);
  const user = await f.unit.run((tx) => tx.user.findUniqueOrThrow({ where: { id: f.user.id } }));
  expect(user.passwordHash).toBeNull();
  expect(user.emailVerifiedAt).toEqual(expect.any(Date));
  const rejected = await f.login();
  expect(rejected.status).toBe(401);
  expect(errorCode(rejected.text)).toBe("auth.invalid_credentials");
});
it("모의 제공자 콜백의 잘못된 state는 리다이렉트 없이 400이다", async () => {
  const f = await sessionFixture();
  const response = await f.http
    .get("/api/v1/oauth/google/callback")
    .query({ state: "unknown", code: "provider-code", scope: "openid" });
  expect(response.status).toBe(400);
  expect(response.headers.location).toBeUndefined();
  expect(errorCode(response.text)).toBe("jsonapi.invalid_query");
});
it("소셜 전용 계정은 password grant로 로그인할 수 없다", async () => {
  const f = await sessionFixture();
  const query = await social(f, "google", "social-only@example.com", true);
  expect((await exchange(f, query)).status).toBe(201);
  const rejected = await f.post({
    grantType: "password",
    email: "social-only@example.com",
    password: "password-123", // betterleaks:allow 사유: CI 비밀번호 grant의 가짜 비밀번호
  });
  expect(rejected.status).toBe(401);
  expect(errorCode(rejected.text)).toBe("auth.invalid_credentials");
  expect(rejected.headers["www-authenticate"]).toBe("Bearer");
});
it("다른 verifier로 시도한 실제 Valkey 코드는 소비되어 올바른 verifier로도 재사용할 수 없다", async () => {
  const f = await sessionFixture();
  const query = await social(f, "google", "csrf@example.com", true);
  const wrong = await exchange(f, query, "a".repeat(43));
  expect(wrong.status).toBe(401);
  expect(errorCode(wrong.text)).toBe("auth.oauth_code_invalid");
  const retry = await exchange(f, query);
  expect(retry.status).toBe(401);
  expect(errorCode(retry.text)).toBe("auth.oauth_code_invalid");
});
it("비활성 기존 계정은 소셜 callback에서 account_deactivated로 돌아온다", async () => {
  const f = await sessionFixture();
  await f.unit.run((tx) =>
    tx.user.update({ where: { id: f.user.id }, data: { status: "deactivated" } }),
  );
  const query = await social(f, "google", f.user.email ?? "", true);
  expect(query.get("error")).toBe("auth.account_deactivated");
  expect(query.has("code")).toBe(false);
});
