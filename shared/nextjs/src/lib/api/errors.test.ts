import { describe, expect, it } from "vitest";
import { ApiError, mapApiError, toFormResult, translateApiError } from "./errors";

const traceId = "1234567890abcdef1234567890abcdef";

describe("API 에러와 폼 결과", () => {
  it.each([
    ["0".repeat(32), traceId],
    ["malformed", traceId],
    ["ABCDEF1234567890ABCDEF1234567890", traceId],
    ["abcdef1234567890abcdef1234567890", "abcdef1234567890abcdef1234567890"],
  ])("응답 trace %s는 0이 아닌 소문자 16진수만 사용한다", async (responseTrace, expected) => {
    const error = await ApiError.fromResponse(
      new Response(JSON.stringify({ meta: { traceId: responseTrace } }), { status: 500 }),
      traceId,
    );
    expect(error.traceId).toBe(expected);
    expect(error.digest).toBe(expected);
  });
  it("코드와 params만 번역하고 여러 필드·폼 에러를 보존한다", () => {
    const error = new ApiError({
      status: 422,
      traceId,
      errors: [
        { code: "validation.too_short", params: { min: 8 }, pointer: "/data/attributes/password" },
        { code: "validation.invalid_format", params: {}, pointer: "/data/attributes/email" },
        { code: "validation.required", params: {}, pointer: "/data/attributes/email" },
        { code: "resource.conflict", params: {}, pointer: "/data/relationships/author/data" },
      ],
    });
    expect(error.status).toBe(422);
    expect(error.code).toBe("validation.too_short");
    expect(error.params).toEqual({ min: 8 });
    expect(error.pointer).toBe("/data/attributes/password");
    expect(error.traceId).toBe(traceId);
    const result = toFormResult(error, "en", ["email", "password"]);
    expect(result).toEqual({
      ok: false,
      formError: "The request conflicts with the current state.",
      fieldErrors: {
        password: ["Enter at least 8 characters."],
        email: ["Enter a value in the correct format.", "Enter a required value."],
      },
    });
    expect(translateApiError(error, "ko")).toContain("8");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    undefined,
    "/data/attributes/email/nested",
    "/data/attributes/",
    "/data/attributes/missing",
    "/data/attributes/bad~2key",
  ])("입력칸과 짝이 없는 pointer %s는 폼 에러다", (pointer) => {
    const error = new ApiError({
      status: 422,
      traceId,
      errors: [
        { code: "validation.required", params: {}, ...(pointer === undefined ? {} : { pointer }) },
      ],
    });
    expect(toFormResult(error, "en", ["email"])).toEqual({
      ok: false,
      formError: "Enter a required value.",
      fieldErrors: {},
    });
  });

  it("입력칸 목록을 생략한 알 수 없는 속성은 숨기지 않고 폼 오류로 보낸다", () => {
    const error = new ApiError({
      status: 422,
      traceId,
      errors: [{ code: "validation.required", params: {}, pointer: "/data/attributes/missing" }],
    });
    expect(toFormResult(error, "en")).toEqual({
      ok: false,
      formError: "Enter a required value.",
      fieldErrors: {},
    });
  });

  it("JSON Pointer의 이스케이프를 풀고 특수 필드 이름도 안전하게 돌려준다", () => {
    const error = new ApiError({
      status: 422,
      traceId,
      errors: [
        { code: "validation.required", params: {}, pointer: "/data/attributes/a~1b~0c" },
        { code: "validation.required", params: {}, pointer: "/data/attributes/__proto__" },
      ],
    });
    const result = toFormResult(error, "en", ["a/b~c", "__proto__"]);
    expect(result.fieldErrors["a/b~c"]).toEqual(["Enter a required value."]);
    expect(Object.hasOwn(result.fieldErrors, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.fieldErrors)).toBe(Object.prototype);
  });

  it("알 수 없는 코드와 비JSON 에러는 계약의 공통 번역으로 처리한다", async () => {
    const response = new Response(
      JSON.stringify({
        errors: [{ code: "new.error", title: "SECRET", detail: "SECRET" }],
        meta: { traceId },
      }),
      { status: 502 },
    );
    const error = await ApiError.fromResponse(response, "fallback");
    expect(error.code).toBe("internal.unexpected");
    expect(translateApiError(error, "en")).toBe("An unexpected error occurred. Try again.");
    expect(error.message).not.toContain("SECRET");
    const malformed = await ApiError.fromResponse(
      new Response("<html>upstream</html>", { status: 503 }),
      traceId,
    );
    expect(malformed.traceId).toBe(traceId);
    expect(malformed.code).toBe("internal.unexpected");
  });

  it("실제 응답의 code·params·pointer·trace를 추출하고 title과 detail은 버린다", async () => {
    const response = new Response(
      JSON.stringify({
        errors: [
          {
            status: "422",
            code: "validation.too_long",
            title: "SECRET",
            detail: "SECRET",
            source: { pointer: "/data/attributes/name" },
            meta: { params: { max: 100 } },
          },
        ],
        meta: { traceId },
      }),
      { status: 422 },
    );
    const error = await ApiError.fromResponse(response, "fallback");
    expect(error.params).toEqual({ max: 100 });
    expect(toFormResult(error, "en", ["name"]).fieldErrors.name).toEqual([
      "Enter no more than 100 characters.",
    ]);
    expect(error.traceId).toBe(traceId);
    expect(JSON.stringify(error)).not.toContain("SECRET");
  });

  it("깨진 문서와 params 누락도 공통 메시지로 표시한다", async () => {
    for (const body of [null, [], { errors: [] }, { errors: [null, 1] }]) {
      const error = await ApiError.fromResponse(
        new Response(JSON.stringify(body), { status: 502 }),
        traceId,
      );
      expect(translateApiError(error, "en")).toBe("An unexpected error occurred. Try again.");
    }
    const error = new ApiError({
      status: 422,
      traceId,
      errors: [{ code: "validation.too_short", params: {} }],
    });
    expect(translateApiError(error, "en")).toBe("An unexpected error occurred. Try again.");
  });

  it.each([
    [401, "auth.unauthenticated", "login"],
    [403, "permission.denied", "forbidden"],
    [404, "resource.not_found", "not-found"],
    [500, "internal.unexpected", "unexpected"],
  ] as const)("%s는 %s를 %s 안내로 분류한다", (status, code, kind) => {
    expect(
      mapApiError(new ApiError({ status, traceId, errors: [{ code, params: {} }] })).kind,
    ).toBe(kind);
  });

  it.each([
    ["42", 42],
    ["0", 0],
    ["-1", null],
    ["bad", null],
    [null, null],
    ["Thu, 01 Jan 2026 00:00:10 GMT", 10],
    ["Wed, 31 Dec 2025 23:59:59 GMT", 0],
  ])("429 Retry-After %s를 초로 바꾼다", async (header, expected) => {
    const response = new Response("{}", {
      status: 429,
      headers: header === null ? {} : { "Retry-After": String(header) },
    });
    const error = await ApiError.fromResponse(
      response,
      traceId,
      Date.parse("2026-01-01T00:00:00Z"),
    );
    expect(mapApiError(error)).toEqual({ kind: "rate-limit", retryAfter: expected });
  });
});
