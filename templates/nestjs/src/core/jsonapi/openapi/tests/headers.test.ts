import { expect, it } from "vitest";
import { buildOpenApi } from "../emit.js";
import { components, jsonInteger } from "../../schemas.js";
import { defineOperation } from "../../operation.js";
import "../../errors.js";

it.each([true, false])(
  "선언한 응답 헤더의 필수 여부와 스키마를 오류 본문과 함께 생성한다: %s",
  (required) => {
    const response = {
      description: "요청이 제한되었다",
      schema: "ErrorDocument",
      contentType: "application/vnd.api+json" as const,
      headers: {
        "Retry-After": {
          required,
          description: "다시 요청할 때까지 기다릴 초다",
          schema: jsonInteger({ format: "int32" }),
        },
      },
    };
    const operation = defineOperation({
      operationId: `HeaderFixture_${String(required)}`,
      method: "GET",
      path: `/header-${String(required)}`,
      tags: ["fixture"],
      summary: "헤더를 선언한다",
      auth: "none",
      responses: { 200: { description: "성공했다" }, 429: response },
      errors: ["rate_limit.exceeded"],
    });
    const doc = buildOpenApi([operation], components());
    expect(doc.paths[operation.path]?.get?.responses[429]).toEqual({
      description: "요청이 제한되었다",
      headers: {
        "Retry-After": {
          required,
          description: "다시 요청할 때까지 기다릴 초다",
          schema: { type: "integer", format: "int32" },
        },
      },
      content: {
        "application/vnd.api+json": { schema: { $ref: "#/components/schemas/ErrorDocument" } },
      },
    });
    expect(doc.paths[operation.path]?.get?.responses[200]).toEqual({ description: "성공했다" });
  },
);
