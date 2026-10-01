/**
 * 소셜 로그인 제공자: 제공자별 신원 판정, 인가 주소, 가짜 OAuth 서버와의 코드 교환. FastAPI 템플릿의
 * auth/tests/test_providers.py와 같은 경우를 본다(프로필 예시도 같다).
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { pkceChallenge } from "../src/core/security.ts";
import type { OAuthProvider } from "../src/modules/auth/model.ts";
import {
  authorizationUrl,
  callbackUrl,
  identity,
  parseProfile,
} from "../src/modules/auth/providers.ts";
import { authorizationRequest, profileOf } from "../src/oauth-server/server.ts";
import { claims, pkce, queryOf } from "./oauth.ts";
import { testApp } from "./support.ts";

// 제공자 문서의 응답 예시를 줄인 것.
const GOOGLE_PROFILE = {
  sub: "10769150350006150715113082367",
  email: "jsmith@example.com",
  email_verified: true,
  hd: "example.com",
  name: "John Smith",
  picture: "https://example.com/p.png",
};
const KAKAO_ACCOUNT = {
  profile: { nickname: "홍길동" },
  is_email_valid: true,
  is_email_verified: true,
  email: "sample@sample.com",
};
const KAKAO_PROFILE = {
  id: 123456789,
  connected_at: "2022-04-11T01:45:28Z",
  kakao_account: KAKAO_ACCOUNT,
};
const NAVER_PROFILE = {
  resultcode: "00",
  message: "success",
  response: { id: "32742776", email: "openapi@naver.com", nickname: "OpenAPI" },
};

function person(
  subject: string,
  email: string | null,
  emailVerified: boolean,
  name: string | null,
) {
  return { subject, email, emailVerified, name };
}

describe("프로필 해석", () => {
  it("구글은 email_verified가 참(불리언)일 때만 이메일을 믿는다", () => {
    expect(parseProfile("google", GOOGLE_PROFILE)).toEqual(
      person("10769150350006150715113082367", "jsmith@example.com", true, "John Smith"),
    );
    const unverified = parseProfile("google", { ...GOOGLE_PROFILE, email_verified: "true" });
    expect(unverified?.emailVerified).toBe(false);
  });

  it("구글은 gmail.com 주소이거나 hd(Workspace)가 있어야 이메일을 믿는다", () => {
    const noHd = { ...GOOGLE_PROFILE, hd: null };
    expect(parseProfile("google", noHd)?.emailVerified).toBe(false);
    expect(parseProfile("google", { ...noHd, hd: "  " })?.emailVerified).toBe(false);
    expect(parseProfile("google", { ...noHd, email: "jsmith@GMAIL.com" })?.emailVerified).toBe(
      true,
    );
    const unverifiedWorkspace = { ...GOOGLE_PROFILE, email_verified: false };
    expect(parseProfile("google", unverifiedWorkspace)?.emailVerified).toBe(false);
  });

  it("카카오는 is_email_valid와 is_email_verified가 모두 참이어야 이메일을 믿는다", () => {
    expect(parseProfile("kakao", KAKAO_PROFILE)).toEqual(
      person("123456789", "sample@sample.com", true, "홍길동"),
    );
    // 다른 카카오계정에 쓰여 만료된 이메일
    const stale = { ...KAKAO_ACCOUNT, is_email_valid: false };
    expect(parseProfile("kakao", { ...KAKAO_PROFILE, kakao_account: stale })?.emailVerified).toBe(
      false,
    );
    expect(parseProfile("kakao", { id: 1, kakao_account: {} })).toEqual(
      person("1", null, false, null),
    );
    const named = { id: 2, kakao_account: { name: "실명", profile: { nickname: " " } } };
    expect(parseProfile("kakao", named)?.name).toBe("실명");
  });

  it("네이버의 이메일은 늘 믿지 않고, 이름이 없으면 닉네임이다", () => {
    expect(parseProfile("naver", NAVER_PROFILE)).toEqual(
      person("32742776", "openapi@naver.com", false, "OpenAPI"),
    );
    const named = { response: { ...NAVER_PROFILE.response, name: "네이버" } };
    expect(parseProfile("naver", named)?.name).toBe("네이버");
  });

  it("이름은 Python의 strip()처럼 앞뒤 공백을 지우고 100자(코드 포인트)로 자른다", () => {
    const parse = (name: unknown) => parseProfile("google", { ...GOOGLE_PROFILE, name })?.name;
    expect(parse("가".repeat(150))).toBe("가".repeat(100));
    expect(parse("😀".repeat(101))).toBe("😀".repeat(100));
    expect(parse("\u3000\x1c Ada \x85\u2029")).toBe("Ada");
    // U+FEFF는 Python의 공백이 아니다.
    expect(parse("\ufeffAda")).toBe("\ufeffAda");
    expect(parse(" \t ")).toBeNull();
    expect(parse(42)).toBeNull();
  });

  it("이메일은 문자열이면 그대로 둔다(앞뒤 공백은 계정을 찾을 때 지운다)", () => {
    const parsed = parseProfile("google", { ...GOOGLE_PROFILE, email: " jsmith@example.com " });
    expect(parsed?.email).toBe(" jsmith@example.com ");
    expect(parseProfile("google", { ...GOOGLE_PROFILE, email: ["a@b.c"] })?.email).toBeNull();
  });

  it("사용자 id가 없으면 해석하지 못하고, 문자열이 아니면 Python의 str()처럼 쓴다", () => {
    const anonymous = Object.fromEntries(
      Object.entries(GOOGLE_PROFILE).filter(([key]) => key !== "sub"),
    );
    expect(parseProfile("google", anonymous)).toBeUndefined();
    expect(parseProfile("kakao", { kakao_account: KAKAO_ACCOUNT })).toBeUndefined();
    expect(parseProfile("naver", { id: "outside-response" })).toBeUndefined();
    const subject = (sub: unknown) => parseProfile("google", { ...GOOGLE_PROFILE, sub })?.subject;
    expect([subject(42), subject(true), subject(null), subject(1.5)]).toEqual([
      "42",
      "True",
      "None",
      "1.5",
    ]);
  });
});

describe("인가 주소와 코드 교환", () => {
  it("인가 주소는 state와 PKCE를 FastAPI(httpx-oauth)와 같은 순서로 담는다", () => {
    const config = DEFAULT_CONFIG;
    const { verifier } = pkce();
    const url = authorizationUrl(config, "naver", "the-state", verifier);
    expect(url.startsWith("http://localhost:4010/_mock/oauth/naver/authorize?")).toBe(true);
    expect(Object.entries(queryOf(url))).toEqual([
      ["response_type", "code"],
      ["client_id", "local-naver-client"],
      ["redirect_uri", "http://localhost:4010/api/v1/oauth/naver/callback"],
      ["state", "the-state"],
      ["scope", "openid"],
      ["code_challenge", pkceChallenge(verifier)],
      ["code_challenge_method", "S256"],
    ]);
  });

  it.each(["google", "kakao", "naver"] as const)(
    "%s의 프로필을 가짜 OAuth 서버에서 읽는다",
    (provider: OAuthProvider) => {
      const { state, config } = testApp();
      const { verifier } = pkce();
      const parsed = authorizationRequest(
        queryOf(authorizationUrl(config, provider, "s", verifier)),
      );
      if ("problem" in parsed) throw new Error(parsed.problem);
      const found = claims(provider, "4242", {
        email: "a@example.com",
        verified: true,
        name: "Ada",
      });
      const location = state.oauthServer.grant(provider, parsed.request, profileOf("4242", found));
      expect(queryOf(location)).toMatchObject({ state: "s" });
      expect(location.startsWith(`${callbackUrl(config, provider)}?`)).toBe(true);
      const code = queryOf(location).code ?? "";
      expect(identity(state, config, provider, code, verifier)).toEqual(
        person("4242", "a@example.com", provider !== "naver", "Ada"),
      );
    },
  );

  it("틀린 verifier, 다른 제공자, 이미 쓴 코드는 교환에 실패한다", () => {
    const { state, config } = testApp();
    const grant = (verifier: string) => {
      const parsed = authorizationRequest(
        queryOf(authorizationUrl(config, "google", "s", verifier)),
      );
      if ("problem" in parsed) throw new Error(parsed.problem);
      const location = state.oauthServer.grant("google", parsed.request, { sub: "7" });
      return queryOf(location).code ?? "";
    };
    const { verifier } = pkce();
    expect(identity(state, config, "google", grant(verifier), pkce().verifier)).toBeUndefined();
    expect(identity(state, config, "kakao", grant(verifier), verifier)).toBeUndefined();
    const code = grant(verifier);
    expect(identity(state, config, "google", code, verifier)?.subject).toBe("7");
    expect(identity(state, config, "google", code, verifier)).toBeUndefined();
  });
});
