import { afterEach, expect, it, vi } from "vitest";
import { OAuthClient } from "../../index.js";
import { settings } from "../../../../core/http/tests/fixtures.js";
import { CHALLENGE, VERIFIER } from "./fixtures.js";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([
  ["google", "openid email profile", "local-google-client"],
  ["kakao", "openid profile_nickname account_email", "local-kakao-client"],
  ["naver", "openid", "local-naver-client"],
] as const)("%s 인가 URL은 설정 주소·OIDC scope·S256를 사용한다", (provider, scope, clientId) => {
  const client = new OAuthClient(settings);
  const redirectUri = "http://localhost:8000/api/v1/oauth/" + provider + "/callback";
  const url = new URL(
    client.authorizeUrl(provider, { state: "state-value", codeChallenge: CHALLENGE, redirectUri }),
  );
  expect(url.origin + url.pathname).toBe("http://127.0.0.1:28080/" + provider + "/authorize");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    client_id: clientId,
    response_type: "code",
    scope,
    state: "state-value",
    code_challenge: CHALLENGE,
    code_challenge_method: "S256",
    redirect_uri: redirectUri,
  });
});
it.each(["google", "kakao", "naver"] as const)(
  "%s 교환은 서버 callback과 verifier를 폼으로 보내고 access token을 읽는다",
  async (provider) => {
    let endpoint: string | undefined;
    let form: URLSearchParams | undefined;
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      endpoint = url;
      form = init.body as URLSearchParams;
      expect(init.method).toBe("POST");
      return Promise.resolve(new Response(JSON.stringify({ access_token: "fixture-access" })));
    });
    expect(await new OAuthClient(settings).exchange(provider, "provider-code", VERIFIER)).toBe(
      "fixture-access",
    );
    expect(endpoint).toBe("http://127.0.0.1:28080/" + provider + "/token");
    expect(Object.fromEntries(form ?? [])).toMatchObject({
      grant_type: "authorization_code",
      code: "provider-code",
      code_verifier: VERIFIER,
      client_id: "local-" + provider + "-client",
      client_secret: "local-" + provider + "-secret",
      redirect_uri: "http://localhost:8000/api/v1/oauth/" + provider + "/callback",
    }); // betterleaks:allow 사유: 공개 모의 서버의 가짜 클라이언트 값
  },
);
it("프로필은 설정 주소에 Bearer 토큰으로 요청한다", async () => {
  let endpoint: string | undefined;
  let headers: Headers | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    endpoint = url;
    headers = new Headers(init.headers);
    return Promise.resolve(new Response(JSON.stringify({ sub: "g1" })));
  });
  expect(await new OAuthClient(settings).profile("google", "fixture-access")).toEqual({
    sub: "g1",
  });
  expect(endpoint).toBe("http://127.0.0.1:28080/google/userinfo");
  expect(headers?.get("authorization")).toBe("Bearer fixture-access");
});
it.each([
  [502, '{"access_token":"x"}'],
  [200, "{}"],
  [200, '{"access_token":""}'],
  [200, "broken-json"],
] as const)("교환 응답 %i %s는 token으로 사용하지 않는다", async (status, text) => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(text, { status })));
  await expect(new OAuthClient(settings).exchange("google", "code", VERIFIER)).rejects.toThrow();
});
it("프로필 HTTP 실패는 신원으로 사용하지 않는다", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
  await expect(new OAuthClient(settings).profile("kakao", "fixture-access")).rejects.toThrow();
});
it("응답하지 않는 제공자 요청은 10초 뒤 중단한다", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    if (!init.signal) throw new Error("중단 신호가 없다");
    return Promise.reject(new DOMException("모의 중단", "TimeoutError"));
  });
  try {
    await expect(new OAuthClient(settings).exchange("google", "code", VERIFIER)).rejects.toThrow();
    expect(timeout).toHaveBeenCalledWith(10000);
  } finally {
    timeout.mockRestore();
  }
});
