/**
 * 가짜 OAuth 서버(/_mock/oauth): 사람이 쓰는 로그인 화면, 적합성 키트처럼 username과 claims를 보내는
 * 폼, 거부, 코드 교환의 규칙(한 번만, 제공자·redirect_uri·PKCE, 10분), 테스트 통로 설정.
 */

import { describe, expect, it } from "vitest";
import { MINUTE } from "../src/core/clock.ts";
import type { OAuthProvider } from "../src/modules/auth/model.ts";
import type { AuthorizationRequest, Profile } from "../src/oauth-server/server.ts";
import { pkce, queryOf, start, submit } from "./oauth.ts";
import { testApp, testClock } from "./support.ts";

type Setup = ReturnType<typeof testApp>;

/** 프로필이 { sub: "u" }인 로그인(빈 claims). */
const LOGIN = { username: "u", claims: "{}" };

/** 백엔드의 콜백 주소(목의 기본 API_URL). */
function callbackOf(provider: OAuthProvider): string {
  return `http://localhost:4010/api/v1/oauth/${provider}/callback`;
}

/** 가짜 OAuth 서버의 인가 화면 주소(백엔드를 거치지 않는다). */
function providerUrl(
  params: Readonly<Record<string, string>> = {},
  provider: OAuthProvider = "kakao",
): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: `local-${provider}-client`,
    redirect_uri: callbackOf(provider),
    state: "the-state",
    ...params,
  });
  return `/_mock/oauth/${provider}/authorize?${query.toString()}`;
}

/** 폼을 보내고 돌려보낸 주소의 쿼리를 준다. */
async function redirected(
  setup: Setup,
  form: Readonly<Record<string, string>>,
  url = providerUrl(),
  provider: OAuthProvider = "kakao",
): Promise<Record<string, string>> {
  const response = await submit(setup.app, url, form);
  expect(response.status, await response.clone().text()).toBe(302);
  const location = response.headers.get("location") ?? "";
  expect(location.startsWith(`${callbackOf(provider)}?`)).toBe(true);
  return queryOf(location);
}

/** 코드를 가짜 OAuth 서버에서 프로필로 바꾼다(백엔드의 코드 교환). */
function redeem(
  setup: Setup,
  code: string | undefined,
  codeVerifier = "",
  provider: OAuthProvider = "kakao",
): Profile | undefined {
  const redirectUri = callbackOf(provider);
  return setup.state.oauthServer.redeem({ provider, code: code ?? "", redirectUri, codeVerifier });
}

describe("로그인 화면", () => {
  it("사람이 신원을 고르는 폼을 보여 준다", async () => {
    const { app } = testApp();
    const response = await app.request(providerUrl());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=UTF-8");
    const html = await response.text();
    expect(html).toContain("<title>카카오 로그인 (목)</title>");
    expect(html).toContain('<form method="post">');
    for (const field of ["username", "name", "email", "emailVerified", "claims", "error"]) {
      expect(html).toContain(`name="${field}"`);
    }
    // 모의 OAuth 서버처럼 로그인 버튼만 input[type=submit]이다(거부는 button).
    expect(html.match(/<input type="submit"/g)).toEqual(['<input type="submit"']);
    const naver = await app.request(providerUrl({}, "naver"));
    expect(await naver.text()).not.toContain('name="emailVerified"');
  });

  it("백엔드의 authorize가 보낸 주소에서 폼이 뜬다", async () => {
    const { app } = testApp();
    const location = await start(app, "google", pkce().challenge);
    const response = await app.request(location);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>Google 로그인 (목)</title>");
  });

  it.each([
    [{ response_type: "token" }, "response_type이 code가 아니다."],
    [{ client_id: "" }, "client_id가 없다."],
    [{ redirect_uri: "/relative" }, "redirect_uri가 http(s) 절대 주소가 아니다."],
    [
      { code_challenge: "c", code_challenge_method: "plain" },
      "code_challenge_method가 S256이 아니다.",
    ],
  ])("인가 요청이 틀렸으면(%j) 돌려보내지 않고 400 안내다", async (params, problem) => {
    const { app } = testApp();
    const response = await app.request(providerUrl(params));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(`인가 요청이 틀렸다: ${problem}`);
    const posted = await submit(app, providerUrl(params), { username: "u" });
    expect(posted.status).toBe(400);
  });

  it("모르는 제공자는 404다", async () => {
    const { app } = testApp();
    const response = await app.request(providerUrl().replace("/kakao/", "/github/"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });

  it("테스트 통로를 끄면 가짜 OAuth 서버도 없다", async () => {
    const { app } = testApp({ testEndpoints: false });
    expect((await app.request(providerUrl())).status).toBe(404);
  });
});

describe("로그인과 거부", () => {
  it("username과 claims로 로그인하면 username이 sub이고 claims가 그 위에 얹힌다", async () => {
    const setup = testApp();
    const claims = { id: 7, sub: "from-claims", nickname: "홍길동", gone: null };
    const back = await redirected(setup, { username: "u-1", claims: JSON.stringify(claims) });
    expect(Object.keys(back)).toEqual(["code", "state"]);
    expect(back.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(back.state).toBe("the-state");
    expect(redeem(setup, back.code)).toEqual({ sub: "from-claims", id: 7, nickname: "홍길동" });
    const plain = await redirected(setup, { username: "u-2", claims: "{}" });
    expect(redeem(setup, plain.code)).toEqual({ sub: "u-2" });
  });

  it("claims 없이 고른 신원은 제공자의 프로필 모양이 된다", async () => {
    const setup = testApp();
    const form = {
      username: "k-1",
      name: " 홍길동 ",
      email: "a@example.com",
      emailVerified: "true",
    };
    const kakao = await redirected(setup, form);
    expect(redeem(setup, kakao.code)).toEqual({
      sub: "k-1",
      id: "k-1",
      kakao_account: {
        email: "a@example.com",
        is_email_valid: true,
        is_email_verified: true,
        profile: { nickname: "홍길동" },
      },
    });
    const google = await redirected(setup, form, providerUrl({}, "google"), "google");
    expect(redeem(setup, google.code, "", "google")).toEqual({
      sub: "k-1",
      email: "a@example.com",
      email_verified: true,
      name: "홍길동",
      hd: "example.com",
    });
    const naver = await redirected(setup, { username: "n-1" }, providerUrl({}, "naver"), "naver");
    expect(redeem(setup, naver.code, "", "naver")).toEqual({ sub: "n-1", response: { id: "n-1" } });
  });

  it("거부하면 error와 state를 붙여 돌려보낸다", async () => {
    const setup = testApp();
    const back = await redirected(setup, { error: "access_denied" });
    expect(back).toEqual({ error: "access_denied", state: "the-state" });
    const stateless = providerUrl().replace("&state=the-state", "");
    expect(await redirected(setup, { error: "access_denied" }, stateless)).toEqual({
      error: "access_denied",
    });
  });

  it("username이 비었거나 claims가 JSON 객체가 아니면 입력을 지켜 폼을 다시 보여 준다", async () => {
    const { app } = testApp();
    for (const [form, problem] of [
      [{ username: " ", email: "keep@example.com" }, "사용자 id를 넣는다."],
      [{ username: "u", claims: "{bad" }, "claims는 JSON 객체여야 한다."],
      [{ username: "u", claims: "[1, 2]" }, "claims는 JSON 객체여야 한다."],
    ] as const) {
      const response = await submit(app, providerUrl(), form);
      expect(response.status).toBe(400);
      const html = await response.text();
      expect(html).toContain(`<p class="problem" role="alert">${problem}</p>`);
      for (const value of Object.values(form)) expect(html).toContain(value);
    }
  });

  it("화면에 넣는 값은 HTML로 이스케이프한다", async () => {
    const { app } = testApp();
    const response = await submit(app, providerUrl(), { username: '"><script>', claims: "<b>" });
    const html = await response.text();
    expect(html).toContain('value="&quot;&gt;&lt;script&gt;"');
    expect(html).toContain("&lt;b&gt;</textarea>");
    expect(html).not.toContain("<script>");
  });
});

describe("코드 교환", () => {
  it("코드는 한 번만 쓰고, 제공자와 redirect_uri가 인가 요청과 같아야 한다", async () => {
    const setup = testApp();
    const { oauthServer } = setup.state;
    const code = (await redirected(setup, LOGIN)).code ?? "";
    const request = { provider: "kakao" as const, code, codeVerifier: "" };
    expect(oauthServer.redeem({ ...request, redirectUri: `${callbackOf("kakao")}/x` })).toBe(
      undefined,
    );
    const other = (await redirected(setup, LOGIN)).code;
    expect(redeem(setup, other, "", "naver")).toBeUndefined();
    const third = (await redirected(setup, LOGIN)).code;
    expect(redeem(setup, third)).toEqual({ sub: "u" });
    expect(redeem(setup, third)).toBeUndefined();
  });

  it("code_challenge가 있으면 그것을 만든 verifier여야 하고, 틀리면 코드가 사라진다", async () => {
    const setup = testApp();
    const { verifier, challenge } = pkce();
    const url = providerUrl({ code_challenge: challenge, code_challenge_method: "S256" });
    const code = (await redirected(setup, LOGIN, url)).code;
    expect(redeem(setup, code, pkce().verifier)).toBeUndefined();
    expect(redeem(setup, code, verifier)).toBeUndefined();
    const fresh = (await redirected(setup, LOGIN, url)).code;
    expect(redeem(setup, fresh, verifier)).toEqual({ sub: "u" });
  });

  it("인가 코드는 10분 뒤 만료된다", async () => {
    const clock = testClock();
    const setup = testApp({}, { clock });
    const early = (await redirected(setup, LOGIN)).code;
    const late = (await redirected(setup, LOGIN)).code;
    // 시계는 부를 때마다 1마이크로초씩 가므로 1밀리초를 남긴다.
    clock.advance(10 * MINUTE - 1000);
    expect(redeem(setup, early)).toEqual({ sub: "u" });
    clock.advance(1000);
    expect(redeem(setup, late)).toBeUndefined();
  });

  it("state가 없으면 붙이지 않고, redirect_uri의 쿼리는 지킨다", () => {
    const { state } = testApp();
    const request: AuthorizationRequest = {
      redirectUri: "http://localhost:4010/cb?keep=1",
      state: undefined,
      codeChallenge: undefined,
    };
    const location = state.oauthServer.grant("naver", request, { sub: "n" });
    expect(location).toMatch(/^http:\/\/localhost:4010\/cb\?keep=1&code=[A-Za-z0-9_-]{43}$/);
  });
});
