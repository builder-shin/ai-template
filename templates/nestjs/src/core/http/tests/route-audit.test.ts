import { Controller, Module } from "@nestjs/common";
import { expect, it } from "vitest";
import { z } from "zod";
import { registeredRoutes, declaredOverlaps, unexpectedOverlaps } from "../routes.js";
import { defineOperation, operations } from "../../jsonapi/operation.js";
import { Operation, JsonApiRequest } from "../../jsonapi/decorators.js";
import { testApp, errorDocument } from "./fixtures.js";

const dynamic = defineOperation({
  operationId: "Audit_get",
  method: "GET",
  path: "/api/v1/audit/{id}",
  tags: ["audit"],
  summary: "조회한다",
  auth: "none",
  params: z.object({ id: z.string().min(3) }),
  responses: { 200: { description: "성공" } },
  errors: [],
});
const specific = defineOperation({
  operationId: "Audit_current",
  method: "GET",
  path: "/api/v1/audit/current",
  tags: ["audit"],
  summary: "현재 항목을 조회한다",
  auth: "none",
  responses: { 200: { description: "성공" } },
  errors: [],
  overlaps: ["Audit_get"],
});
@Controller()
class AuditController {
  @Operation(dynamic) get(@JsonApiRequest() input: { params: { id: string } }) {
    return { data: { id: input.params.id } };
  }
  @Operation(specific) current() {
    return { data: { id: "current" } };
  }
}
@Module({ controllers: [AuditController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class AuditModule {}
it("앱의 모든 등록 라우트에 허용 목록 밖의 겹침이 없다", async () => {
  const { app } = await testApp([]);
  expect(registeredRoutes(app)).toEqual([
    { method: "GET", path: "/health/live" },
    { method: "GET", path: "/health/ready" },
  ]);
  expect(unexpectedOverlaps(registeredRoutes(app), declaredOverlaps(operations()))).toEqual([]);
});
it("실제 등록 라우트의 겹침은 operation 허용 선언으로만 통과한다", async () => {
  const { app, http } = await testApp([AuditModule]);
  const routes = registeredRoutes(app);
  expect(routes).toEqual(
    expect.arrayContaining([
      { method: "GET", path: "/api/v1/audit/:id" },
      { method: "GET", path: "/api/v1/audit/current" },
    ]),
  );
  expect(unexpectedOverlaps(routes, [])).toHaveLength(1);
  expect(unexpectedOverlaps(routes, declaredOverlaps([dynamic, specific]))).toEqual([]);
  expect(JSON.parse((await http.get("/api/v1/audit/current")).text) as unknown).toEqual({
    data: { id: "current" },
  });
});
it("등록한 Operation의 요청 팩토리가 던진 검증 오류도 전역 필터가 응답한다", async () => {
  const { http } = await testApp([AuditModule]);
  const response = await http.get("/api/v1/audit/x");
  expect(response.status).toBe(404);
  expect(response.headers["content-type"]).toBe("application/vnd.api+json");
  expect(errorDocument(response.text)).toMatchObject({
    errors: [{ status: "404", code: "resource.not_found", source: { parameter: "id" } }],
  });
});
it("허용 선언의 operation이 없으면 감사 준비를 거절한다", () => {
  expect(() => declaredOverlaps([{ ...specific, overlaps: ["Missing"] }])).toThrow(/Missing/);
});
