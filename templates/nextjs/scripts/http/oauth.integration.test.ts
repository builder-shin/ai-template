import { createHash, randomUUID } from "node:crypto";
import { jwtDecrypt, EncryptJWT } from "jose";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../src/lib/env";
import { base, mockClient, responseSession } from "./helpers";

type Provider = "google" | "kakao" | "naver";
const encryptionKey = createHash("sha256").update(EXAMPLE_SESSION_SECRET).digest();
const headers = { Origin: base, "Accept-Language": "ko" };

async function start(provider: Provider = "google", returnTo = "/me", locale = "ko") {
  const response = await fetch(
    `${base}/oauth/${provider}/start?${new URLSearchParams({ returnTo, locale })}`,
    { headers, redirect: "manual" },
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("oauth="));
  expect(cookie).toBeTruthy();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
  expect(cookie).toMatch(/Max-Age=600/i);
  const pair = cookie!.split(";", 1)[0]!;
  const { payload } = await jwtDecrypt(pair.slice("oauth=".length), encryptionKey);
  const authorize = new URL(response.headers.get("location")!);
  expect(authorize.pathname).toBe(`/api/v1/oauth/${provider}/authorize`);
  expect(authorize.searchParams.get("redirectUri")).toBe(`${base}/oauth/callback`);
  expect(authorize.searchParams.get("codeChallenge")).toBe(
    createHash("sha256").update(String(payload.verifier)).digest("base64url"),
  );
  return { cookie: pair, payload, authorize };
}

async function providerCallback(authorize: URL, provider: Provider, error?: string) {
  const started = await fetch(authorize, { headers, redirect: "manual" });
  expect(started.status).toBe(302);
  const providerUrl = new URL(started.headers.get("location")!);
  expect(providerUrl.pathname).toBe(`/_mock/oauth/${provider}/authorize`);
  const username = randomUUID();
  const claims = {
    google: {
      sub: username,
      name: "OAuth member",
      email: `${username}@example.com`,
      email_verified: true,
    },
    kakao: { id: username, kakao_account: { profile: { nickname: "OAuth member" } } },
    naver: { response: { id: username, name: "OAuth member" } },
  }[provider];
  const signed = await fetch(providerUrl, {
    method: "POST",
    body: new URLSearchParams({
      username,
      claims: JSON.stringify(claims),
      ...(error ? { error } : {}),
    }),
    redirect: "manual",
  });
  expect(signed.status).toBe(302);
  const backend = await fetch(signed.headers.get("location")!, { headers, redirect: "manual" });
  expect(backend.status).toBe(302);
  return new URL(backend.headers.get("location")!);
}

function callback(url: URL, cookie?: string) {
  // 제공자에서 돌아오는 최상위 GET에는 같은 Origin 표식이 없다.
  return fetch(url, {
    redirect: "manual",
    headers: { "Sec-Fetch-Site": "cross-site", ...(cookie ? { Cookie: cookie } : {}) },
  });
}

async function failed(
  response: Response,
  notice = "auth.oauth_failed",
  returnTo = "/me",
  locale = "ko",
) {
  expect(response.status).toBe(303);
  const url = new URL(response.headers.get("location")!);
  expect(url.origin).toBe(base);
  expect(url.pathname).toBe(locale === "en" ? "/en/login" : "/login");
  expect(url.searchParams.get("notice")).toBe(notice);
  expect(url.searchParams.get("returnTo")).toBe(returnTo);
  const cookies = response.headers.getSetCookie();
  expect(cookies.some((value) => /^oauth=;/.test(value) && /Max-Age=0/i.test(value))).toBe(true);
  expect(cookies.some((value) => value.startsWith("session="))).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const page = await fetch(url, { headers });
  const html = new JSDOM(await page.text()).window.document;
  // Next의 스트림 조각은 JS 실행 전에는 main 밖에 있을 수 있다.
  expect(html.querySelector("[role=alert]")?.textContent).toBe(
    locale === "en"
      ? notice === "auth.oauth_denied"
        ? "Social sign-in was cancelled."
        : "Social sign-in failed."
      : notice === "auth.oauth_denied"
        ? "소셜 로그인을 취소했습니다."
        : "소셜 로그인에 실패했습니다.",
  );
}

describe("실제 목 제공자를 거치는 OAuth HTTP", () => {
  it.each(["google", "kakao", "naver"] as const)(
    "%s 로그인은 PKCE와 JWE로 세션을 만들고 returnTo로 간다",
    async (provider) => {
      const attempt = await start(provider, "/my-posts?status=draft#editor");
      expect(attempt.payload).toMatchObject({
        provider,
        returnTo: "/my-posts?status=draft#editor",
        locale: "ko",
      });
      expect(attempt.payload.exp! - attempt.payload.iat!).toBe(600);
      expect(String(attempt.payload.verifier)).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
      expect(attempt.cookie).not.toContain(String(attempt.payload.verifier));
      const url = await providerCallback(attempt.authorize, provider);
      const response = await callback(url, attempt.cookie);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${base}/my-posts?status=draft#editor`);
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.getSetCookie().join(";")).toContain("NEXT_LOCALE=ko");
      expect(response.headers.getSetCookie().join(";")).toMatch(/oauth=;.*Max-Age=0/i);
      const session = await responseSession(response);
      const { data: me } = await mockClient(session.accessToken).GET("/me");
      expect(me!.data.attributes.name).toBe("OAuth member");
      expect(response.headers.get("location")).not.toContain(session.accessToken);
      const sessionPair = response.headers
        .getSetCookie()
        .find((value) => value.startsWith("session="))!
        .split(";", 1)[0]!;
      const page = await fetch(`${base}/me`, { headers: { ...headers, Cookie: sessionPair } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("OAuth member");
      await failed(
        await callback(url, attempt.cookie),
        "auth.oauth_failed",
        "/my-posts?status=draft#editor",
      ); // 1회용 코드 재사용도 거절한다.
      await mockClient(session.accessToken).DELETE("/me");
    },
  );

  it("계정 언어가 로그인 화면 언어를 이기며 URL·쿠키를 함께 맞춘다", async () => {
    const attempt = await start();
    const username = randomUUID();
    // 같은 제공자 신원을 두 번 사용해서 기존 계정의 언어를 확인한다.
    async function samePerson(authorize: URL) {
      const first = await fetch(authorize, { headers, redirect: "manual" });
      const signed = await fetch(first.headers.get("location")!, {
        method: "POST",
        redirect: "manual",
        body: new URLSearchParams({
          username,
          claims: JSON.stringify({ sub: username, name: "English member" }),
        }),
      });
      const backend = await fetch(signed.headers.get("location")!, { headers, redirect: "manual" });
      return new URL(backend.headers.get("location")!);
    }
    const first = await callback(await samePerson(attempt.authorize), attempt.cookie);
    const session = await responseSession(first);
    await mockClient(session.accessToken).PATCH("/me", {
      body: {
        data: {
          type: "users",
          id: (await mockClient(session.accessToken).GET("/me")).data!.data.id,
          attributes: { locale: "en" },
        },
      },
    });
    const second = await start("google", "/ko/my-posts?q=hello#preview");
    const response = await callback(await samePerson(second.authorize), second.cookie);
    expect(response.headers.get("location")).toBe(`${base}/en/my-posts?q=hello#preview`);
    expect(response.headers.getSetCookie().join(";")).toContain("NEXT_LOCALE=en");
    const current = await responseSession(response);
    await mockClient(current.accessToken).DELETE("/me");
  });

  it.each([
    ["access_denied", "auth.oauth_denied", "ko"],
    ["server_error", "auth.oauth_failed", "en"],
  ])("제공자의 %s를 번역한 로그인 안내로 바꾼다", async (error, notice, locale) => {
    const attempt = await start("google", "/me", locale);
    await failed(
      await callback(await providerCallback(attempt.authorize, "google", error), attempt.cookie),
      notice,
      "/me",
      locale,
    );
  });

  it("쿠키 없는 콜백은 code를 교환하지 않는다", async () => {
    const attempt = await start();
    const url = await providerCallback(attempt.authorize, "google");
    await failed(await callback(url), "auth.oauth_failed", "/");
    const valid = await callback(url, attempt.cookie);
    const session = await responseSession(valid);
    await mockClient(session.accessToken).DELETE("/me");
  });

  it("명시된 제공자 불일치는 교환 전에 거절한다", async () => {
    const attempt = await start();
    const url = await providerCallback(attempt.authorize, "google");
    url.searchParams.set("provider", "naver");
    await failed(await callback(url, attempt.cookie));
    url.searchParams.set("provider", "google");
    const valid = await callback(url, attempt.cookie);
    const session = await responseSession(valid);
    await mockClient(session.accessToken).DELETE("/me");
  });

  it("다른 제공자 시도의 code와 cookie를 섞으면 PKCE가 거절한다", async () => {
    const google = await start();
    const naver = await start("naver");
    const url = await providerCallback(google.authorize, "google");
    await failed(await callback(url, naver.cookie));
  });

  it.each(["duplicate-provider", "missing-code", "empty-code", "duplicate-code"])(
    "%s 입력을 거절하고 원래 코드를 소비하지 않는다",
    async (kind) => {
      const attempt = await start();
      const original = await providerCallback(attempt.authorize, "google");
      const invalid = new URL(original);
      if (kind === "duplicate-provider") {
        invalid.searchParams.append("provider", "google");
        invalid.searchParams.append("provider", "google");
      } else if (kind === "missing-code") invalid.searchParams.delete("code");
      else if (kind === "empty-code") invalid.searchParams.set("code", "");
      else invalid.searchParams.append("code", original.searchParams.get("code")!);
      await failed(await callback(invalid, attempt.cookie));
      const valid = await callback(original, attempt.cookie);
      expect(valid.status).toBe(303);
      const session = await responseSession(valid);
      await mockClient(session.accessToken).DELETE("/me");
    },
  );

  it.each(["tampered", "expired", "session"])("%s 쿠키를 거절한다", async (kind) => {
    const attempt = await start();
    let value = "broken";
    if (kind !== "tampered") {
      value = await new EncryptJWT(kind === "session" ? { accessToken: "opaque" } : attempt.payload)
        .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
        .setExpirationTime(kind === "expired" ? Math.floor(Date.now() / 1000) - 1 : "10m")
        .encrypt(encryptionKey);
    }
    await failed(
      await callback(new URL(`${base}/oauth/callback?code=unused`), `oauth=${value}`),
      "auth.oauth_failed",
      "/",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/en/%252f%252fevil.example",
    "/en/..//evil.example",
  ])("외부 returnTo %s는 홈으로 바꾼다", async (returnTo) => {
    const attempt = await start("google", returnTo);
    expect(attempt.payload.returnTo).toBe("/");
    const result = await callback(
      await providerCallback(attempt.authorize, "google"),
      attempt.cookie,
    );
    expect(result.headers.get("location")).toBe(`${base}/`);
    const session = await responseSession(result);
    await mockClient(session.accessToken).DELETE("/me");
  });

  it("출처가 다른 start는 쿠키를 만들지 않는다", async () => {
    for (const requestHeaders of [
      {},
      { Origin: "https://evil.example" },
      { "Sec-Fetch-Site": "cross-site" },
      { Origin: base, "Sec-Fetch-Site": "same-site" },
    ]) {
      const response = await fetch(`${base}/oauth/google/start`, {
        headers: requestHeaders,
        redirect: "manual",
      });
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
  });

  it("모르는 제공자를 시작할 수 없다", async () => {
    const response = await fetch(`${base}/oauth/unknown/start`, { headers, redirect: "manual" });
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ["/login", "ko", ["Google로 로그인", "카카오로 로그인", "네이버로 로그인"]],
    ["/en/login", "en", ["Continue with Google", "Continue with Kakao", "Continue with Naver"]],
  ] as const)("%s는 JS 없이 제공자 시작 링크를 렌더링한다", async (path, locale, names) => {
    const response = await fetch(`${base}${path}?returnTo=%2Fmy-posts%3Fstatus%3Ddraft`, {
      headers,
    });
    const document = new JSDOM(await response.text()).window.document;
    for (const [index, provider] of ["google", "kakao", "naver"].entries()) {
      const link = Array.from(document.querySelectorAll("a")).find(
        (item) => item.textContent === names[index],
      );
      expect(link).toBeTruthy();
      const url = new URL(link!.getAttribute("href")!, base);
      expect(url.pathname).toBe(`/oauth/${provider}/start`);
      expect(url.searchParams.get("returnTo")).toBe("/my-posts?status=draft");
      expect(url.searchParams.get("locale")).toBe(locale);
    }
  });
});
