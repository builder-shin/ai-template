import "reflect-metadata";
import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../../core/http/create-app.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
import { TicketStore } from "../../../core/realtime/tickets.js";
import { buildOpenApi } from "../../../core/jsonapi/openapi/emit.js";
import { operations } from "../../../core/jsonapi/operation.js";
import { components } from "../../../core/jsonapi/schemas.js";
import { settings } from "../../../core/http/tests/fixtures.js";
import { registeredRoutes } from "../../../core/http/routes.js";
import { member } from "./gateway-fixture.js";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { redisFixture } from "../../../core/realtime/tests/redis-fixture.js";
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks();
});
it("초기화 전 설정 콜백을 적용하여 어댑터를 먼저 연결할 수 있다", async () => {
  const app = await createApp(
    {
      settings,
      configure: (app) => {
        app.use((_request: Request, response: Response, next: NextFunction) => {
          response.setHeader("X-Realtime-Fixture", "configured");
          next();
        });
      },
    },
    false,
  );
  apps.push(app);
  const response = await request(app.getHttpServer()).get("/health/live");
  expect(response.status).toBe(200);
  expect(response.headers["x-realtime-fixture"]).toBe("configured");
});
it("인증된 POST 경로에서 201 티켓 문서와 30초 만료를 반환한다", async () => {
  const app = await createApp(
    {
      settings,
      providers: [
        { provide: PRINCIPAL_RESOLVER, useValue: { resolve: () => Promise.resolve(member) } },
      ],
    },
    false,
  );
  apps.push(app);
  const tickets = new TicketStore(redisFixture().redis);
  vi.spyOn(app.get<TicketStore>(TicketStore), "issue").mockImplementation((principal) =>
    tickets.issue(principal),
  );
  expect(registeredRoutes(app)).toContainEqual({
    method: "POST",
    path: "/api/v1/realtime-tickets",
  });
  const before = Date.now();
  const response = await request(app.getHttpServer())
    .post("/api/v1/realtime-tickets")
    .set("Authorization", "Bearer fixture")
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "realtime-tickets", attributes: {} } });
  expect(response.status).toBe(201);
  const parsed = z
    .object({
      data: z.object({
        type: z.literal("realtime-tickets"),
        id: z.string(),
        attributes: z.object({ token: z.string(), expiresAt: z.string() }),
      }),
    })
    .parse(JSON.parse(response.text) as unknown);
  expect(await tickets.consume(parsed.data.attributes.token)).toEqual(member);
  const expiry = Date.parse(parsed.data.attributes.expiresAt);
  expect(expiry).toBeGreaterThanOrEqual(before + 30000);
  expect(expiry).toBeLessThanOrEqual(Date.now() + 30000);
});
it("티켓 경로의 익명 요청은 401로 거절한다", async () => {
  const app = await createApp({ settings }, false);
  apps.push(app);
  const response = await request(app.getHttpServer())
    .post("/api/v1/realtime-tickets")
    .set("Content-Type", "application/vnd.api+json")
    .send({ data: { type: "realtime-tickets", attributes: {} } });
  expect(response.status).toBe(401);
});
it("OpenAPI는 선언한 메시지와 session.revoked 및 채널을 내보낸다", () => {
  const document = buildOpenApi(operations(), components()) as unknown as Record<string, unknown>;
  expect(document["x-realtime-messages"]).toEqual([
    { name: "subscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
    { name: "unsubscribe", payload: "RealtimeSubscription", ack: "RealtimeAck" },
  ]);
  expect(document["x-realtime-events"]).toContainEqual({
    name: "session.revoked",
    rooms: ["user:{userId}"],
    payload: "SessionRevokedEventDocument",
  });
  expect(document["x-realtime-channels"]).toEqual([
    { name: "posts", permission: null },
    { name: "posts:all", permission: "posts:manage" },
  ]);
});
it("빈 티켓 attributes 스키마는 계약처럼 properties 없이 내보낸다", () => {
  expect(
    buildOpenApi(operations(), components()).components.schemas.RealtimeTicketCreateAttributes,
  ).toEqual({ type: "object" });
});
