import "reflect-metadata";
import { Controller, type ExecutionContext, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { expect, it } from "vitest";
import { z } from "zod";
import { defineOperation, operations } from "../operation.js";
import { Operation, JsonApiRequest, OPERATION_METADATA } from "../decorators.js";
const base = {
  tags: ["posts"],
  summary: "글 조회",
  auth: "optional",
  path: "/api/v1/posts/{id}",
  responses: { 200: { description: "성공" } },
  errors: [],
} as const;
it.each(["missing", "-missing", "createdAt,-missing"])(
  "기본 정렬은 sort에 선언한 필드만 쓴다: %s",
  (defaultSort) => {
    const operationId = `InvalidDefaultSort_${defaultSort}`;
    expect(() =>
      defineOperation({
        ...base,
        operationId,
        method: "GET",
        query: { sort: ["createdAt"], defaultSort },
      }),
    ).toThrow(`기본 정렬이 sort 선언에 없다: ${operationId} missing`);
  },
);
it.each(["createdAt", "-createdAt"])(
  "선언한 기본 정렬은 방향과 관계없이 받는다: %s",
  (defaultSort) => {
    expect(
      defineOperation({
        ...base,
        operationId: `ValidDefaultSort_${defaultSort}`,
        method: "GET",
        query: { sort: ["createdAt"], defaultSort },
      }).query.defaultSort,
    ).toBe(defaultSort);
  },
);
it("POST에는 403과 409 및 오류 코드를 자동으로 더한다", () => {
  const declaration = defineOperation({ ...base, operationId: "Task5Post", method: "POST" });
  expect(declaration.responses).toMatchObject({
    403: { schema: "ErrorDocument" },
    409: { schema: "ErrorDocument" },
  });
  expect(declaration.errors).toEqual(["permission.denied", "resource.conflict"]);
  expect(operations()).toContain(declaration);
});
it("PATCH는 409를 더하고 기존 응답과 오류를 보존한다", () => {
  const declaration = defineOperation({
    ...base,
    operationId: "Task5Patch",
    method: "PATCH",
    responses: { 409: { description: "기존 충돌" } },
    errors: ["resource.conflict"],
  });
  expect(declaration.responses[409]?.description).toBe("기존 충돌");
  expect(declaration.errors).toEqual(["resource.conflict"]);
  const automatic = defineOperation({
    ...base,
    operationId: "Task5PatchAutomatic",
    method: "PATCH",
  });
  expect(automatic.responses[409]?.schema).toBe("ErrorDocument");
});
it("같은 operationId를 두 번 선언하면 오류다", () => {
  defineOperation({ ...base, operationId: "Task5Duplicate", method: "GET" });
  expect(() =>
    defineOperation({ ...base, operationId: "Task5Duplicate", method: "GET" }),
  ).toThrow();
});
it("Operation은 계약 경로를 Nest 경로와 메타데이터로 등록한다", () => {
  const declaration = defineOperation({ ...base, operationId: "Task5Route", method: "GET" });
  class ControllerFixture {
    read() {
      return {};
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(ControllerFixture.prototype, "read");
  if (!descriptor) throw new Error("처리기 없음");
  const handler = descriptor.value as () => unknown;
  Operation(declaration)(ControllerFixture.prototype, "read", descriptor);
  expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe("/api/v1/posts/:id");
  expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  expect(Reflect.getMetadata(OPERATION_METADATA, handler)).toBe(declaration);
});
it("JsonApiRequest는 원본 URL을 검증하고 주체와 파싱된 값을 전달한다", () => {
  const declaration = defineOperation({
    ...base,
    operationId: "Task5Argument",
    method: "GET",
    params: z.object({ id: z.string() }),
    query: { filters: { q: z.string() } },
  });
  @Controller()
  class ControllerFixture {
    @Operation(declaration)
    read(@JsonApiRequest() input: unknown) {
      return input;
    }
  }
  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, ControllerFixture, "read") as Record<
    string,
    { factory: (data: unknown, context: ExecutionContext) => unknown }
  >;
  const factory = Object.values(metadata)[0]?.factory;
  if (!factory) throw new Error("인자 factory 없음");
  const handler = Object.getOwnPropertyDescriptor(ControllerFixture.prototype, "read")?.value as
    (() => unknown) | undefined;
  if (!handler) throw new Error("처리기 없음");
  const principal = { userId: "u1", sessionId: "s1", permissions: new Set() };
  const req = {
    originalUrl: "/api/v1/posts/p1?filter[q]=original",
    query: { "filter[q]": "wrong" },
    params: { id: "p1" },
    body: undefined,
    principal,
  };
  const context = {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  expect(factory(undefined, context)).toMatchObject({
    query: { filter: { q: "original" } },
    params: { id: "p1" },
    principal,
  });
});
