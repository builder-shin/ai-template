import { expect, it } from "vitest";
import request from "supertest";
import {
  rateLimitFixtureApp,
  RateLimitFixtureController,
  protectedWrite,
} from "../../../../tests/fixtures/ratelimit.js";
import { validateRequest, type ValidatedRequest } from "../../jsonapi/validation.js";
import { settings, errorDocument } from "../../http/tests/fixtures.js";
import { store } from "./fixtures.js";

it("통합 fixture의 실제 controller가 주입된 엄격 한도를 적용하고 앱을 닫는다", async () => {
  const { clients, evalCommand } = store([2, 42]);
  const app = await rateLimitFixtureApp(settings, clients);
  const server = app.getHttpServer();
  try {
    expect(server.listening).toBe(false);
    const req: ValidatedRequest = {
      ...validateRequest(protectedWrite, {
        search: "",
        params: {},
        body: { data: { type: "fixtures", attributes: { title: "valid" } } },
      }),
      principal: {
        userId: "fixture-user",
        sessionId: "fixture-session",
        permissions: new Set(),
      },
    };
    await expect(app.get(RateLimitFixtureController).write(req)).rejects.toMatchObject({
      init: {
        status: 429,
        code: "rate_limit.exceeded",
        headers: { "Retry-After": "42" },
        meta: { params: { retryAfter: 42 } },
      },
    });
    expect(evalCommand).toHaveBeenCalledExactlyOnceWith(
      expect.any(String),
      1,
      "aitpl:15:rl:strict:password_change.user:fixture-user",
      3600,
    );
  } finally {
    await app.close();
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  }
});

it("엄격 한도의 실제 HTTP 429는 Retry-After와 같은 정수 초를 meta.params에 직렬화한다", async () => {
  const { clients } = store([2, 42]);
  const app = await rateLimitFixtureApp(settings, clients);
  const server = app.getHttpServer();
  try {
    const res = await request(server)
      .post("/api/v1/ratelimit-fixture")
      .set("Authorization", "Bearer fixture")
      .set("Content-Type", "application/vnd.api+json")
      .send({ data: { type: "fixtures", attributes: { title: "valid" } } });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("42");
    const error = errorDocument(res.text).errors[0];
    expect(error).toMatchObject({
      status: "429",
      code: "rate_limit.exceeded",
      meta: { params: { retryAfter: 42 } },
    });
    expect(error?.meta).not.toHaveProperty("retryAfter");
    expect(error?.meta?.params).toEqual({ retryAfter: Number(res.headers["retry-after"]) });
    expect(Number.isInteger(Number(res.headers["retry-after"]))).toBe(true);
  } finally {
    await app.close();
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  }
});
