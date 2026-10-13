import { All, Controller, Get, Module } from "@nestjs/common";
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
    return { data: { id: "dynamic-" + input.params.id } };
  }
  @Operation(specific) current() {
    return { data: { id: "specific-current" } };
  }
}
@Module({ controllers: [AuditController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class AuditModule {}
it("앱의 모든 등록 라우트에 허용 목록 밖의 겹침이 없다", async () => {
  const { app } = await testApp([]);
  expect(registeredRoutes(app)).toEqual([
    { method: "POST", path: "/api/v1/registrations" },
    { method: "POST", path: "/api/v1/email-verification-requests" },
    { method: "POST", path: "/api/v1/email-verifications" },
    { method: "GET", path: "/api/v1/permissions" },
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
    data: { id: "specific-current" },
  });
  expect(JSON.parse((await http.get("/api/v1/audit/known")).text) as unknown).toEqual({
    data: { id: "dynamic-known" },
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
@Controller()
class AllController {
  @All("/api/v1/wild/current") current() {
    return { data: null };
  }
}
@Controller()
class WildController {
  @Get("/api/v1/wild/:id") get() {
    return { data: null };
  }
}
@Module({ controllers: [AllController, WildController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class AllModule {}
it("Nest All 라우트의 겹침도 실제 등록된 메서드별로 감사한다", async () => {
  const { app } = await testApp([AllModule]);
  const all = { method: "GET", path: "/api/v1/wild/current" };
  const get = { method: "GET", path: "/api/v1/wild/:id" };
  const routes = registeredRoutes(app);
  expect(routes).toContainEqual(all);
  expect(unexpectedOverlaps(routes, [])).toEqual([[all, get]]);
  expect(unexpectedOverlaps(routes, [[all, get]])).toEqual([]);
});
it("Express _all 라우트도 다른 메서드의 겹침을 허용 목록으로 감사한다", async () => {
  const { app } = await testApp([]);
  const express = app.getHttpAdapter().getInstance();
  express.route("/api/v1/raw/current").all((_req, res) => {
    res.end();
  });
  express.get("/api/v1/raw/:id", (_req, res) => {
    res.end();
  });
  const all = { method: "ALL", path: "/api/v1/raw/current" };
  const get = { method: "GET", path: "/api/v1/raw/:id" };
  const routes = registeredRoutes(app);
  expect(routes).toContainEqual(all);
  expect(unexpectedOverlaps(routes, [])).toEqual([[all, get]]);
  expect(unexpectedOverlaps(routes, [[all, get]])).toEqual([]);
});
