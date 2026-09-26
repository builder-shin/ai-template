import { describe, expect, it } from "vitest";
import { operation, refName, responseRef, schema, spec, statuses } from "./spec.ts";

const ERROR_CODES = [
  "jsonapi.unsupported_media_type",
  "jsonapi.not_acceptable",
  "jsonapi.invalid_document",
  "jsonapi.invalid_query",
  "jsonapi.unsupported_include",
  "jsonapi.unsupported_sort",
  "validation.required",
  "validation.too_short",
  "validation.too_long",
  "validation.invalid_format",
  "validation.out_of_range",
  "validation.invalid_choice",
  "validation.already_taken",
  "auth.unauthenticated",
  "auth.invalid_credentials",
  "auth.token_expired",
  "auth.token_invalid",
  "auth.refresh_token_reused",
  "auth.oauth_code_invalid",
  "auth.email_not_verified",
  "auth.account_deactivated",
  "auth.verification_token_invalid",
  "permission.denied",
  "role.system_role_protected",
  "resource.not_found",
  "resource.conflict",
  "post.invalid_transition",
  "file.too_large",
  "file.type_not_allowed",
  "file.upload_incomplete",
  "rate_limit.exceeded",
  "internal.unexpected",
  "service.unavailable",
];

describe("계약 기본", () => {
  it("OpenAPI 3.1 문서다", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("에러 코드 목록이 스펙 §5.4와 같다", () => {
    expect(schema("ErrorCode").enum).toEqual(ERROR_CODES);
  });

  it("에러 문서는 errors와 meta.traceId를 반드시 담는다", () => {
    const document = schema("ErrorDocument");
    expect(document.required).toEqual(["errors", "meta"]);
    expect(document.properties?.meta?.required).toEqual(["traceId"]);
    expect(refName(document.properties?.errors?.items)).toBe("ErrorObject");
  });

  it("에러 객체는 status, code, title을 반드시 담는다", () => {
    const error = schema("ErrorObject");
    expect(error.required).toEqual(["status", "code", "title"]);
    expect(refName(error.properties?.code)).toBe("ErrorCode");
    expect(refName(error.properties?.source)).toBe("ErrorSource");
  });
});

describe("헬스체크 (JSON:API 예외)", () => {
  it("live는 application/json으로 HealthReport를 돌려준다", () => {
    const live = operation("get", "/health/live");
    expect(statuses(live)).toEqual(["200"]);
    expect(responseRef(live, "200", "application/json")).toBe("HealthReport");
  });

  it("ready는 준비되지 않았으면 503을 돌려준다", () => {
    const ready = operation("get", "/health/ready");
    expect(statuses(ready)).toEqual(["200", "503"]);
    expect(responseRef(ready, "503", "application/json")).toBe("HealthReport");
  });
});
