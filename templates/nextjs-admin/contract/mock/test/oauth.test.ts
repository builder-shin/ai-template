/**
 * 소셜 로그인: 계정 연결 규칙, 실패는 프론트 콜백의 error, state·redirectUri·제공자 검사, 리다이렉트의
 * 쿼리 규칙. FastAPI 템플릿의 auth/tests/test_oauth.py와 같은 경우를 목의 가짜 OAuth 서버로 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MINUTE, SECOND } from "../src/core/clock.ts";
import { rolesOfUser } from "../src/modules/roles/service.ts";
import { newAccount, PASSWORD, passwordGrant, register, send } from "./accounts.ts";
import {
  callback,
  claims,
  comeBack,
  FRONT,
  me,
  pkce,
  queryOf,
  signInAtProvider,
  social,
  start,
} from "./oauth.ts";
import { codesOf, errorsOf, realtimeLog, testApp, testClock } from "./support.ts";

const AUTHORIZE = "/api/v1/oauth/google/authorize";

function authorizeQuery(params: Readonly<Record<string, string>>): string {
  return `${AUTHORIZE}?${new URLSearchParams({ ...params }).toString()}`;
}

/** 400 jsonapi.invalid_query의 (source.parameter, detail). */
async function invalidQuery(response: Response): Promise<[string | undefined, string | undefined]> {
  const [error] = await errorsOf(response, 400);
  expect(error?.code).toBe("jsonapi.invalid_query");
  return [error?.source?.parameter, error?.detail];
}

describe("계정 연결", () => {
  it("검증된 이메일은 새 계정을 만들거나 같은 이메일의 계정에 연결한다", async () => {
    const { app, state } = testApp();
    const email = `fresh-${randomUUID()}@gmail.com`;
    const fresh = await me(app, await social(app, "google", "g1", { email, verified: true }));
    expect(fresh).toMatchObject({ email, name: "Social User" });
    expect(state.store.users.get(fresh.id)?.passwordHash).toBeNull();
    const existing = newAccount(state);
    const joined = await social(app, "google", "g2", { email: existing.email, verified: true });
    expect((await me(app, joined)).id).toBe(existing.id);
    const other = `other-${randomUUID()}@example.com`;
    const again = await social(app, "google", "g2", { email: other, verified: true });
    expect((await me(app, again)).id).toBe(existing.id);
  });

  it("인증 전에 가입한 계정은 검증된 주인에게 연결되고 그 비밀번호를 잃는다", async () => {
    const { app, state } = testApp();
    const squatter = await register(app);
    const owner = await social(app, "kakao", "7001", { email: squatter.email, verified: true });
    expect((await me(app, owner)).id).toBe(squatter.userId);
    expect(state.store.users.get(squatter.userId)?.emailVerifiedAt).not.toBeNull();
    const login = await send(app, "POST", "/api/v1/sessions", {
      document: passwordGrant(squatter.email, PASSWORD),
    });
    expect(await codesOf(login, 401)).toEqual(["auth.invalid_credentials"]);
  });

  it.each([
    ["kakao", false],
    ["naver", true],
  ] as const)("%s의 미검증 이메일로는 이메일 없는 새 계정을 만든다", async (provider, verified) => {
    const { app, state } = testApp();
    const existing = newAccount(state);
    const back = await social(app, provider, randomUUID(), { email: existing.email, verified });
    const user = await me(app, back);
    expect(user.id).not.toBe(existing.id);
    expect(user.email).toBeNull();
    expect(state.store.users.get(user.id)?.emailVerifiedAt).toBeNull();
  });

  it("구글이 검증했어도 hd(Workspace)가 없는 gmail.com 밖 이메일은 믿지 않는다", async () => {
    const { app, state } = testApp();
    const existing = newAccount(state);
    const options = { email: existing.email, verified: true, googleWorkspace: false };
    const user = await me(app, await social(app, "google", "g-outsider", options));
    expect(user.id).not.toBe(existing.id);
    expect(user.email).toBeNull();
  });

  it("(제공자, 사용자 id)가 같으면 같은 계정이고, 제공자가 다르면 다른 사람이다", async () => {
    const { app } = testApp();
    const first = await me(app, await social(app, "naver", "same-person"));
    const again = await me(app, await social(app, "naver", "same-person"));
    const kakao = await me(app, await social(app, "kakao", "same-person"));
    expect(again.id).toBe(first.id);
    expect(kakao.id).not.toBe(first.id);
  });

  it("새 계정은 제공자의 이름, 콜백 요청의 로케일, member 역할을 갖고 비밀번호가 없다", async () => {
    const { app, state } = testApp();
    const headers = { "Accept-Language": "en-US,en;q=0.9,ko;q=0.8" };
    const back = await social(app, "kakao", randomUUID(), { name: "  Ada  ", headers });
    const user = state.store.users.get((await me(app, back)).id);
    expect(user).toMatchObject({ name: "Ada", locale: "en", passwordHash: null, email: null });
    expect(rolesOfUser(state.store, user?.id ?? "").map((role) => role.name)).toEqual(["member"]);
  });

  it("비활성 계정은 auth.account_deactivated로 돌아가고, 같은 이메일의 비활성 계정에는 연결하지 않는다", async () => {
    const { app, state } = testApp();
    const user = await me(app, await social(app, "naver", "n-closed"));
    const row = state.store.users.get(user.id);
    if (row === undefined) throw new Error("계정이 없다");
    row.status = "deactivated";
    expect(await social(app, "naver", "n-closed")).toEqual({ error: "auth.account_deactivated" });
    const closed = newAccount(state);
    closed.status = "deactivated";
    const back = await social(app, "google", "g-closed", { email: closed.email, verified: true });
    expect(back).toEqual({ error: "auth.account_deactivated" });
    const links = [...state.store.socialAccounts.values()];
    expect(links.filter((link) => link.subject === "g-closed")).toEqual([]);
    row.status = "active";
    expect((await me(app, await social(app, "naver", "n-closed"))).id).toBe(user.id);
  });

  it("탈퇴하면 연결을 지워서, 같은 사람이 다시 로그인하면 새 계정이다", async () => {
    const { app, state } = testApp();
    const email = `leaver-${randomUUID()}@gmail.com`;
    const user = await me(app, await social(app, "google", "g-leaver", { email, verified: true }));
    const left = await send(app, "DELETE", "/api/v1/me", { token: user.accessToken });
    expect(left.status).toBe(204);
    expect([...state.store.socialAccounts.values()].map((link) => link.userId)).not.toContain(
      user.id,
    );
    const returned = await social(app, "google", "g-leaver", { email, verified: true });
    expect((await me(app, returned)).id).not.toBe(user.id);
  });

  it("FastAPI처럼 실시간 이벤트를 내지 않는다", async () => {
    const { app, state } = testApp();
    const log = realtimeLog(state);
    const squatter = await register(app);
    await me(app, await social(app, "kakao", "quiet", { email: squatter.email, verified: true }));
    expect(log).toEqual([]);
  });
});

describe("실패는 프론트 콜백의 error", () => {
  it("거부는 auth.oauth_denied, 제공자의 다른 에러와 코드 교환 실패는 auth.oauth_failed다", async () => {
    const { app } = testApp();
    const stateOf = async () => queryOf(await start(app, "google", pkce().challenge)).state ?? "";
    const denied = await comeBack(app, "google", {
      state: await stateOf(),
      error: "access_denied",
    });
    expect(denied).toEqual({ error: "auth.oauth_denied" });
    const broken = await comeBack(app, "google", { state: await stateOf(), error: "server_error" });
    expect(broken).toEqual({ error: "auth.oauth_failed" });
    const params = { state: await stateOf(), code: "wrong", scope: "openid" };
    expect(await comeBack(app, "google", params)).toEqual({ error: "auth.oauth_failed" });
    expect(await comeBack(app, "google", { state: await stateOf() })).toEqual({
      error: "auth.oauth_failed",
    });
    const empty = await comeBack(app, "google", { state: await stateOf(), error: "", code: "c" });
    expect(empty).toEqual({ error: "auth.oauth_failed" });
  });

  it("제공자의 코드는 한 번만 바꾸고, 사용자 id가 없는 프로필은 auth.oauth_failed다", async () => {
    const { app } = testApp();
    const location = await start(app, "kakao", pkce().challenge);
    const returned = await signInAtProvider(app, location, "k", claims("kakao", "k"));
    expect((await comeBack(app, "kakao", returned)).code).toBeDefined();
    const state = queryOf(await start(app, "kakao", pkce().challenge)).state ?? "";
    const reused = await comeBack(app, "kakao", { state, code: returned.code ?? "" });
    expect(reused).toEqual({ error: "auth.oauth_failed" });
    const anonymous = await start(app, "kakao", pkce().challenge);
    const found = { kakao_account: { email: "a@example.com" } };
    const idless = await comeBack(app, "kakao", await signInAtProvider(app, anonymous, "k", found));
    expect(idless).toEqual({ error: "auth.oauth_failed" });
  });

  it("프론트 콜백의 쿼리와 조각을 지키고 빈 값은 뺀다(FastAPI의 _with_query)", async () => {
    const target = "http://localhost:3000/cb?from=app&empty=#top";
    const { app } = testApp({ oauthRedirectUris: [target] });
    const location = await start(app, "naver", pkce().challenge, target);
    const state = queryOf(location).state ?? "";
    const response = await callback(app, "naver", { state, error: "access_denied" });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/cb?from=app&error=auth.oauth_denied#top",
    );
  });
});

describe("state, redirectUri, 제공자", () => {
  it("허용하지 않은 redirectUri, 모르는 state, 다른 제공자의 state는 400이고, 모르는 제공자는 404다", async () => {
    const { app } = testApp();
    const outside = await app.request(
      authorizeQuery({ redirectUri: "https://evil.example/cb", codeChallenge: pkce().challenge }),
    );
    expect(await invalidQuery(outside)).toEqual([
      "redirectUri",
      "redirectUri is not one of the allowed front-end callbacks.",
    ]);
    const unknown = await callback(app, "google", { state: "never-issued" });
    expect(await invalidQuery(unknown)).toEqual(["state", "The state is unknown or has expired."]);
    const state = queryOf(await start(app, "google", pkce().challenge)).state ?? "";
    expect(await invalidQuery(await callback(app, "kakao", { state, code: "c" }))).toEqual([
      "state",
      "The state is unknown or has expired.",
    ]);
    // 다른 제공자의 콜백도 state를 꺼내면서 지운다.
    expect((await callback(app, "google", { state, code: "c" })).status).toBe(400);
    const github = `/api/v1/oauth/github/authorize?redirectUri=${encodeURIComponent(FRONT)}&codeChallenge=${pkce().challenge}`;
    expect(await codesOf(await app.request(github), 404)).toEqual(["resource.not_found"]);
    const githubBack = await app.request("/api/v1/oauth/github/callback?state=s");
    expect(await codesOf(githubBack, 404)).toEqual(["resource.not_found"]);
  });

  it("state는 10분 뒤 만료된다", async () => {
    const clock = testClock();
    const { app } = testApp({}, { clock });
    const early = queryOf(await start(app, "google", pkce().challenge)).state ?? "";
    const late = queryOf(await start(app, "google", pkce().challenge)).state ?? "";
    clock.advance(10 * MINUTE - SECOND);
    expect(await comeBack(app, "google", { state: early, error: "access_denied" })).toEqual({
      error: "auth.oauth_denied",
    });
    clock.advance(SECOND);
    expect((await callback(app, "google", { state: late, error: "access_denied" })).status).toBe(
      400,
    );
  });

  it("authorize는 제공자 로그인 화면으로 state와 백엔드의 PKCE(S256)를 붙여 보낸다", async () => {
    const { app } = testApp();
    const bff = pkce();
    const location = await start(app, "google", bff.challenge);
    const [endpoint, query] = location.split("?");
    expect(endpoint).toBe("http://localhost:4010/_mock/oauth/google/authorize");
    expect(query).toMatch(
      /^response_type=code&client_id=local-google-client&redirect_uri=http%3A%2F%2Flocalhost%3A4010%2Fapi%2Fv1%2Foauth%2Fgoogle%2Fcallback&state=[A-Za-z0-9_-]{43}&scope=openid\+email\+profile&code_challenge=[A-Za-z0-9_-]{43}&code_challenge_method=S256$/,
    );
    expect(queryOf(location).code_challenge).not.toBe(bff.challenge);
    const naver = queryOf(await start(app, "naver", bff.challenge));
    expect([naver.client_id, naver.scope]).toEqual(["local-naver-client", "openid"]);
    const kakao = queryOf(await start(app, "kakao", bff.challenge));
    expect(kakao.scope).toBe("openid profile_nickname account_email");
  });

  it("API_URL의 끝 /는 떼고 제공자와 콜백 주소를 만든다", async () => {
    const { app } = testApp({ apiUrl: "https://api.example.com//" });
    const location = await start(app, "kakao", pkce().challenge);
    expect(location.startsWith("https://api.example.com/_mock/oauth/kakao/authorize?")).toBe(true);
    expect(queryOf(location).redirect_uri).toBe(
      "https://api.example.com/api/v1/oauth/kakao/callback",
    );
  });
});

describe("리다이렉트의 쿼리 파라미터", () => {
  it("codeChallenge가 없거나 base64url 43자가 아니면 400이다", async () => {
    const { app } = testApp();
    expect(await invalidQuery(await app.request(authorizeQuery({ redirectUri: FRONT })))).toEqual([
      "codeChallenge",
      "Query parameter codeChallenge is required.",
    ]);
    for (const bad of ["too-short", `${"a".repeat(42)}=`, "a".repeat(44), `${"a".repeat(42)}\n`]) {
      const response = await app.request(
        authorizeQuery({ redirectUri: FRONT, codeChallenge: bad }),
      );
      expect(await invalidQuery(response)).toEqual([
        "codeChallenge",
        "Query parameter codeChallenge must match ^[A-Za-z0-9_-]{43}$.",
      ]);
    }
  });

  it("redirectUri는 http(s) 절대 주소여야 하고 codeChallenge보다 먼저 본다", async () => {
    const { app } = testApp();
    for (const redirectUri of ["localhost:3000/oauth/callback", "http:///cb", "http://[::1/cb"]) {
      const response = await app.request(authorizeQuery({ redirectUri, codeChallenge: "short" }));
      expect(await invalidQuery(response)).toEqual([
        "redirectUri",
        "Query parameter redirectUri must be an absolute URL.",
      ]);
    }
    const allowedLater = await app.request(
      authorizeQuery({ redirectUri: "https://evil.example/cb", codeChallenge: "short" }),
    );
    expect((await invalidQuery(allowedLater))[0]).toBe("codeChallenge");
  });

  it("authorize는 모르는 파라미터와 두 번 온 파라미터를 받지 않는다", async () => {
    const { app } = testApp();
    const challenge = pkce().challenge;
    const unknown = await app.request(
      authorizeQuery({ redirectUri: FRONT, codeChallenge: challenge, prompt: "login" }),
    );
    expect(await invalidQuery(unknown)).toEqual(["prompt", "Unknown query parameter prompt."]);
    const twice = await app.request(
      `${AUTHORIZE}?redirectUri=${encodeURIComponent(FRONT)}&redirectUri=x&codeChallenge=${challenge}`,
    );
    expect(await invalidQuery(twice)).toEqual([
      "redirectUri",
      "Query parameter redirectUri must appear once.",
    ]);
  });

  it("callback은 state가 필수이고, 모르는 파라미터는 받지만 두 번 온 파라미터는 받지 않는다", async () => {
    const { app } = testApp();
    expect(await invalidQuery(await app.request("/api/v1/oauth/google/callback"))).toEqual([
      "state",
      "Query parameter state is required.",
    ]);
    const twice = await app.request("/api/v1/oauth/google/callback?state=a&code=b&code=c");
    expect(await invalidQuery(twice)).toEqual(["code", "Query parameter code must appear once."]);
    const state = queryOf(await start(app, "google", pkce().challenge)).state ?? "";
    const extra = await comeBack(app, "google", { state, error: "access_denied", iss: "x" });
    expect(extra).toEqual({ error: "auth.oauth_denied" });
  });

  it("쿼리 오류(400)가 모르는 제공자(404)보다 먼저고, 302에는 본문이 없다", async () => {
    const { app } = testApp();
    const response = await app.request("/api/v1/oauth/github/authorize");
    expect(await invalidQuery(response)).toEqual([
      "redirectUri",
      "Query parameter redirectUri is required.",
    ]);
    const found = await app.request(
      authorizeQuery({ redirectUri: FRONT, codeChallenge: pkce().challenge }),
    );
    expect(found.status).toBe(302);
    expect(await found.text()).toBe("");
    expect(found.headers.get("content-type")).toBeNull();
  });
});
