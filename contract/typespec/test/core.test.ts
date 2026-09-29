import { describe, expect, it } from "vitest";
import {
  type Operation,
  operation,
  refName,
  requestRef,
  responseRef,
  schema,
  spec,
  statuses,
} from "./spec.ts";

const ERROR_CODES = [
  "jsonapi.unsupported_media_type",
  "jsonapi.not_acceptable",
  "jsonapi.content_too_large",
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
  "auth.reauthentication_required",
  "auth.oauth_denied",
  "auth.oauth_failed",
  "auth.email_not_verified",
  "auth.account_deactivated",
  "auth.verification_token_invalid",
  "permission.denied",
  "role.system_role_protected",
  "role.last_admin_protected",
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

/** 계약의 모든 operation을 `메서드 경로`와 함께 돌려준다. */
function operations(): { key: string; method: string; op: Operation }[] {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({
      key: `${method.toUpperCase()} ${path}`,
      method,
      op,
    })),
  );
}

/** 요청 문서의 data에 relationships가 있는가(관계를 함께 보내는 생성·수정). */
function sendsRelationships(op: Operation): boolean {
  const name = requestRef(op);
  if (name === undefined) return false;
  return schema(name).properties?.data?.properties?.relationships !== undefined;
}

describe("생성·수정 응답 (JSON:API 1.1)", () => {
  it("모든 POST는 403(클라이언트가 만든 id)과 409(type 불일치)를 선언한다", () => {
    const missing = operations()
      .filter(({ method }) => method === "post")
      .filter(({ op }) => !("403" in op.responses && "409" in op.responses))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it("본문을 받는 operation은 413(본문이 1 MiB를 넘는다)을 선언한다", () => {
    const missing = operations()
      .filter(({ op }) => op.requestBody !== undefined && !("413" in op.responses))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it("관계를 함께 보내는 요청은 404(관계가 가리키는 리소스가 없다)를 선언한다", () => {
    const missing = operations()
      .filter(({ op }) => sendsRelationships(op) && !("404" in op.responses))
      .map(({ key }) => key);
    expect(missing).toEqual([]);
  });

  it("같은 상태의 에러 응답을 두 번 선언하지 않는다", () => {
    // AuthErrors와 CreateErrors처럼 같은 상태를 두 번 넣으면 TypeSpec이 anyOf로 겹친다.
    const doubled = operations().flatMap(({ key, op }) =>
      Object.entries(op.responses)
        .filter(([, response]) =>
          Object.values(response.content ?? {}).some(
            (media) => (media.schema?.anyOf?.length ?? 0) > 1,
          ),
        )
        .map(([status]) => `${key} ${status}`),
    );
    expect(doubled).toEqual([]);
  });
});

describe("필터", () => {
  it("관계로 거르는 필터는 관련 리소스의 id(uuid)를 받는다", () => {
    const filters = [
      ["/api/v1/users", "filter[role]"],
      ["/api/v1/posts", "filter[author]"],
      ["/api/v1/audit-logs", "filter[actor]"],
    ] as const;
    for (const [path, name] of filters) {
      const parameter = operation("get", path).parameters?.find((each) => each.name === name);
      expect(parameter?.schema?.format, `${path} ${name}`).toBe("uuid");
    }
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

describe("페이지 링크 (FastAPI 설계 F20)", () => {
  it("네 링크 모두 상대 경로를 허용하는 URI-reference다", () => {
    const links = schema("PaginationLinks").properties ?? {};
    expect(Object.keys(links)).toEqual(["first", "last", "prev", "next"]);
    for (const link of Object.values(links)) {
      expect(link.format).toBe("uri-reference");
    }
  });
});
