import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MEDIA_TYPE } from "../../src/jsonapi/assertions.ts";
import type { OAuthProvider, OAuthReturn } from "../../src/side-channels.ts";
import {
  api,
  codes,
  type ErrorDocument,
  FRONT_CALLBACK,
  newUser,
  oauth,
  signInAdmin,
  target,
} from "./support.ts";

const PROVIDERS: readonly OAuthProvider[] = ["google", "kakao", "naver"];
/** 형식만 맞으면 되는 codeChallenge(base64url 43자). redirectUri나 provider를 보는 테스트에 쓴다. */
const VALID_CODE_CHALLENGE = "A".repeat(43);

function signInWith(code: string | null, codeVerifier: string) {
  return api().POST("/api/v1/sessions", {
    body: {
      data: {
        type: "sessions",
        attributes: { grantType: "oauthCode", code: code ?? "", codeVerifier },
      },
    },
  });
}

/** 1회용 코드로 세션을 열고 그 세션의 사용자(/me)를 준다. signIn의 결과나, code와 codeVerifier를 받는다. */
async function userOf(
  source: OAuthReturn | { readonly code: string | null; readonly codeVerifier: string },
) {
  const code = "query" in source ? source.query.get("code") : source.code;
  const created = await signInWith(code, source.codeVerifier);
  expect(created.response.status).toBe(201);
  const me = await api(created.data?.data.attributes.accessToken).GET("/api/v1/me");
  return me.data?.data;
}

function person(email?: string, emailVerified = false) {
  return {
    subject: randomUUID(),
    name: "Conformance",
    ...(email === undefined ? {} : { email, emailVerified }),
  };
}

describe(`소셜 로그인 (${target.name})`, () => {
  it.each(PROVIDERS)(
    "%s로 처음 로그인하면 계정을 만들고, 1회용 코드는 한 번만 쓴다",
    async (provider) => {
      const back = await oauth.signIn(provider, FRONT_CALLBACK, person());
      const code = back.query.get("code");
      expect(back.query.get("error")).toBeNull();
      const user = await userOf(back);
      expect(user?.attributes.name).toBe("Conformance");
      const reused = await signInWith(code, back.codeVerifier);
      expect(reused.response.status).toBe(401);
      expect(codes(reused.error)).toEqual(["auth.oauth_code_invalid"]);
    },
  );

  it("같은 제공자의 같은 사람은 같은 계정으로 돌아온다", async () => {
    const someone = person();
    const first = await userOf(await oauth.signIn("naver", FRONT_CALLBACK, someone));
    const again = await userOf(await oauth.signIn("naver", FRONT_CALLBACK, someone));
    expect(again?.id).toBe(first?.id);
  });

  it("구글이 검증한 이메일은 같은 이메일의 계정에 연결한다", async () => {
    const existing = await newUser();
    const back = await oauth.signIn("google", FRONT_CALLBACK, person(existing.email, true));
    expect((await userOf(back))?.id).toBe(existing.userId);
  });

  it("구글이 검증했어도 hd(Workspace)가 없는 gmail.com 밖 이메일은 기존 계정에 연결하지 않는다", async () => {
    const existing = await newUser();
    const outsider = { ...person(existing.email, true), googleWorkspace: false };
    const user = await userOf(await oauth.signIn("google", FRONT_CALLBACK, outsider));
    expect(user?.id).not.toBe(existing.userId);
    expect(user?.attributes.email).toBeNull();
  });

  it.each([
    ["kakao", false],
    ["naver", true],
  ] as const)(
    "%s의 미검증 이메일로는 기존 계정에 연결하지 않고 이메일 없는 계정을 만든다",
    async (provider, verified) => {
      const existing = await newUser();
      const back = await oauth.signIn(provider, FRONT_CALLBACK, person(existing.email, verified));
      const user = await userOf(back);
      expect(user?.id).not.toBe(existing.userId);
      expect(user?.attributes.email).toBeNull();
    },
  );

  it("거부(access_denied)는 auth.oauth_denied, 제공자의 다른 에러와 코드 교환 실패는 auth.oauth_failed로 프론트에 돌아간다", async () => {
    const denied = await oauth.start("google", FRONT_CALLBACK);
    const back = await oauth.callback("google", { state: denied.state, error: "access_denied" });
    expect(back.get("error")).toBe("auth.oauth_denied");
    const broken = await oauth.start("naver", FRONT_CALLBACK);
    const error = await oauth.callback("naver", { state: broken.state, error: "server_error" });
    expect(error.get("error")).toBe("auth.oauth_failed");
    const failed = await oauth.start("kakao", FRONT_CALLBACK);
    const wrong = await oauth.callback("kakao", { state: failed.state, code: "wrong-code" });
    expect(wrong.get("error")).toBe("auth.oauth_failed");
  });

  it("비활성 계정은 auth.account_deactivated로 프론트에 돌아간다", async () => {
    const someone = person();
    const user = await userOf(await oauth.signIn("google", FRONT_CALLBACK, someone));
    const manager = await signInAdmin();
    const id = user?.id ?? "";
    const closed = await manager.api.PATCH("/api/v1/users/{id}", {
      params: { path: { id } },
      body: { data: { type: "users", id, attributes: { status: "deactivated" } } },
    });
    expect(closed.response.status).toBe(200);
    const back = await oauth.signIn("google", FRONT_CALLBACK, someone);
    expect(back.query.get("error")).toBe("auth.account_deactivated");
  });

  it("허용하지 않은 redirectUri와 모르는 state는 400, 모르는 제공자는 404다", async () => {
    const outside = await api().GET("/api/v1/oauth/{provider}/authorize", {
      params: {
        path: { provider: "google" },
        query: { redirectUri: "https://evil.example/cb", codeChallenge: VALID_CODE_CHALLENGE },
      },
      redirect: "manual",
    });
    expect(outside.response.status).toBe(400);
    expect(outside.error?.errors.map((error) => [error.code, error.source?.parameter])).toEqual([
      ["jsonapi.invalid_query", "redirectUri"],
    ]);
    const unknown = await api().GET("/api/v1/oauth/{provider}/callback", {
      params: { path: { provider: "google" }, query: { state: randomUUID() } },
      redirect: "manual",
    });
    expect(unknown.response.status).toBe(400);
    const missing = await fetch(
      `${target.baseUrl}/api/v1/oauth/github/authorize?redirectUri=${encodeURIComponent(FRONT_CALLBACK)}&codeChallenge=${VALID_CODE_CHALLENGE}`,
      { redirect: "manual" },
    );
    expect(missing.status).toBe(404);
  });

  it("authorize와 callback도 Accept를 협상한다: 매개변수가 붙은 JSON:API 미디어 타입만 받으면 406이다", async () => {
    const headers = { Accept: `${MEDIA_TYPE}; ext="https://example.com/ext"` };
    const authorize = await api().GET("/api/v1/oauth/{provider}/authorize", {
      params: {
        path: { provider: "google" },
        query: { redirectUri: FRONT_CALLBACK, codeChallenge: VALID_CODE_CHALLENGE },
      },
      headers,
      redirect: "manual",
    });
    expect(authorize.response.status).toBe(406);
    expect(codes(authorize.error)).toEqual(["jsonapi.not_acceptable"]);
    const callback = await api().GET("/api/v1/oauth/{provider}/callback", {
      params: { path: { provider: "google" }, query: { state: randomUUID() } },
      headers,
      redirect: "manual",
    });
    expect(callback.response.status).toBe(406);
    expect(codes(callback.error)).toEqual(["jsonapi.not_acceptable"]);
  });

  it("codeChallenge가 없거나 형식이 틀리면 400이고, codeVerifier가 안 맞거나 RFC 7636 형식이 아니면 401이며 코드는 그때 이미 쓴다", async () => {
    const redirectUri = encodeURIComponent(FRONT_CALLBACK);
    const queries = [
      `redirectUri=${redirectUri}`,
      `redirectUri=${redirectUri}&codeChallenge=short`,
    ];
    for (const query of queries) {
      const response = await fetch(`${target.baseUrl}/api/v1/oauth/google/authorize?${query}`, {
        redirect: "manual",
      });
      expect(response.status, query).toBe(400);
      const body = (await response.json()) as ErrorDocument;
      expect(
        body.errors.map((error) => [error.code, error.source?.parameter]),
        query,
      ).toEqual([["jsonapi.invalid_query", "codeChallenge"]]);
    }

    const back = await oauth.signIn("kakao", FRONT_CALLBACK, person());
    expect(back.query.get("error")).toBeNull();
    const code = back.query.get("code");
    expect(code).not.toBeNull();
    const wrongVerifier = await signInWith(code, `not-${back.codeVerifier}`);
    expect(wrongVerifier.response.status).toBe(401);
    expect(codes(wrongVerifier.error)).toEqual(["auth.oauth_code_invalid"]);
    const rightVerifier = await signInWith(code, back.codeVerifier);
    expect(rightVerifier.response.status).toBe(401);
    expect(codes(rightVerifier.error)).toEqual(["auth.oauth_code_invalid"]);

    // 빈 verifier의 S256도 43자라 authorize는 받는다. 코드 교환에서 verifier의 형식으로 거부한다.
    const empty = await oauth.signIn("kakao", FRONT_CALLBACK, person(), { codeVerifier: "" });
    expect(empty.query.get("error")).toBeNull();
    const emptyCode = empty.query.get("code");
    expect(emptyCode).not.toBeNull();
    const emptyVerifier = await signInWith(emptyCode, "");
    expect(emptyVerifier.response.status).toBe(401);
    expect(codes(emptyVerifier.error)).toEqual(["auth.oauth_code_invalid"]);
  });
});
