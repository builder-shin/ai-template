import { describe, expect, it } from "vitest";
import { validateResponse, validateSchema } from "../src/validation.ts";

const errorDocument = {
  errors: [{ status: "404", code: "resource.not_found", title: "Not Found" }],
  meta: { traceId: "0123456789abcdef0123456789abcdef" },
};

describe("계약 스키마 검증", () => {
  it("계약 컴포넌트 스키마로 값을 검증한다", () => {
    expect(validateSchema("ErrorDocument", errorDocument)).toEqual([]);
    const problems = validateSchema("ErrorDocument", { errors: [] });
    expect(problems.join("\n")).toContain("meta");
  });

  it("계약에 없는 에러 코드를 잡는다", () => {
    const bad = { ...errorDocument, errors: [{ ...errorDocument.errors[0], code: "nope" }] };
    expect(validateSchema("ErrorDocument", bad).length).toBeGreaterThan(0);
  });

  it("operation과 상태 코드로 응답 스키마를 찾는다", () => {
    const body = { status: "ok", checks: { database: "ok" } };
    expect(validateResponse("get", "/health/live", 200, "application/json", body)).toEqual([]);
  });

  it("응답 본문이 계약 스키마와 다르면 위치와 함께 알린다", () => {
    const body = { status: "fine", checks: {} };
    const problems = validateResponse("get", "/health/live", 200, "application/json", body);
    expect(problems.join("\n")).toContain("/status");
  });

  it("계약에 없는 상태 코드는 문제다", () => {
    const problems = validateResponse("get", "/health/live", 418, "application/json", {});
    expect(problems).toEqual(["GET /health/live는 계약에 418 응답이 없다."]);
  });

  it("계약에 없는 operation은 문제다", () => {
    expect(validateResponse("get", "/api/v1/nope", 200, null, null)).toEqual([
      "GET /api/v1/nope는 계약에 없는 operation이다.",
    ]);
  });
});
