import { describe, expect, it } from "vitest";
import {
  auth,
  operation,
  refName,
  requestRef,
  resourceType,
  responseRef,
  schema,
  spec,
  statuses,
} from "./spec.ts";

describe("가입과 이메일 인증 (§4.2)", () => {
  it("가입은 공개 엔드포인트이고 201로 가입 리소스를 돌려준다", () => {
    const create = operation("post", "/api/v1/registrations");
    expect(auth(create)).toBe("none");
    expect(requestRef(create)).toBe("RegistrationCreateDocument");
    expect(responseRef(create, "201")).toBe("RegistrationDocument");
  });

  it("인증 메일 재발송과 비밀번호 재설정 요청은 항상 202다", () => {
    for (const path of ["/api/v1/email-verification-requests", "/api/v1/password-reset-requests"]) {
      const create = operation("post", path);
      expect(statuses(create)).toContain("202");
      expect(statuses(create)).not.toContain("201");
    }
  });

  it("이메일 인증과 비밀번호 재설정은 토큰을 받는다", () => {
    expect(requestRef(operation("post", "/api/v1/email-verifications"))).toBe(
      "EmailVerificationCreateDocument",
    );
    expect(requestRef(operation("post", "/api/v1/password-resets"))).toBe(
      "PasswordResetCreateDocument",
    );
  });

  it("비밀번호 변경은 로그인이 필요하다", () => {
    expect(auth(operation("post", "/api/v1/password-changes"))).toBe("required");
  });
});

describe("세션 (§4.2, §5.5)", () => {
  it("로그인·갱신·소셜 로그인 완료를 grantType 판별 유니온으로 받는다", () => {
    const grant = schema("SessionGrant");
    expect(grant.oneOf?.map((variant) => refName(variant))).toEqual([
      "SessionPasswordGrant",
      "SessionRefreshTokenGrant",
      "SessionOAuthCodeGrant",
    ]);
    const create = operation("post", "/api/v1/sessions");
    expect(auth(create)).toBe("none");
    expect(responseRef(create, "201")).toBe("SessionWithTokensDocument");
  });

  it("토큰은 생성 응답에만 있고 목록에는 없다", () => {
    const withTokens = Object.keys(schema("SessionWithTokensAttributes").properties ?? {});
    expect(withTokens).toEqual(expect.arrayContaining(["accessToken", "refreshToken"]));
    const plain = Object.keys(schema("SessionAttributes").properties ?? {});
    expect(plain).not.toContain("accessToken");
    expect(resourceType(schema("SessionWithTokensResource"))).toBe("sessions");
  });

  it("현재 세션 로그아웃과 특정 세션 폐기를 나눠 둔다", () => {
    expect(statuses(operation("delete", "/api/v1/sessions/current"))).toContain("204");
    expect(statuses(operation("delete", "/api/v1/sessions/{id}"))).toContain("404");
  });

  it("다른 기기·전체 로그아웃은 session-revocations로 한다", () => {
    const create = operation("post", "/api/v1/session-revocations");
    expect(requestRef(create)).toBe("SessionRevocationCreateDocument");
    expect(schema("SessionRevocationScope").enum).toEqual(["others", "all"]);
  });

  it("실시간 티켓은 로그인한 사용자만 발급받는다", () => {
    const create = operation("post", "/api/v1/realtime-tickets");
    expect(auth(create)).toBe("required");
    expect(responseRef(create, "201")).toBe("RealtimeTicketDocument");
  });
});

describe("OAuth 리다이렉트 (JSON:API 예외)", () => {
  it("authorize와 callback은 302로 리다이렉트한다", () => {
    for (const path of [
      "/api/v1/oauth/{provider}/authorize",
      "/api/v1/oauth/{provider}/callback",
    ]) {
      const redirect = operation("get", path);
      expect(statuses(redirect)).toContain("302");
      expect(Object.keys(redirect.responses["302"]?.headers ?? {})).toEqual(["location"]);
    }
  });

  it("제공자는 google, kakao, naver다", () => {
    expect(schema("OAuthProvider").enum).toEqual(["google", "kakao", "naver"]);
  });

  it("계약의 모든 경로가 /api/v1 또는 /health 아래에 있다", () => {
    for (const path of Object.keys(spec.paths)) {
      expect(path.startsWith("/api/v1/") || path.startsWith("/health/")).toBe(true);
    }
  });
});
