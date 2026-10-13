import "reflect-metadata";
import { Controller, Inject, Module, HttpCode } from "@nestjs/common";
import { z } from "zod";
import type { Settings } from "../../src/core/config/settings.js";
import type { RedisClients } from "../../src/core/redis/clients.js";
import { createApp } from "../../src/core/http/create-app.js";
import { GLOBAL_LIMITER } from "../../src/core/http/pipeline.js";
import { createGlobalLimiter } from "../../src/core/ratelimit/global.js";
import { StrictLimiter } from "../../src/core/ratelimit/strict.js";
import { JsonLogger } from "../../src/core/logging/json-logger.js";
import { Operation, JsonApiRequest } from "../../src/core/jsonapi/decorators.js";
import { defineOperation } from "../../src/core/jsonapi/operation.js";
import type { ValidatedRequest } from "../../src/core/jsonapi/validation.js";
import { PRINCIPAL_RESOLVER, type PrincipalResolver } from "../../src/core/security/principal.js";

export const protectedWrite = defineOperation({
  operationId: "RateLimitFixture_write",
  method: "POST",
  path: "/api/v1/ratelimit-fixture",
  tags: ["fixture"],
  summary: "인증과 본문 검증 뒤 엄격 한도를 센다",
  auth: "required",
  body: z.object({
    data: z.object({
      type: z.literal("fixtures"),
      attributes: z.object({ title: z.string().min(3) }),
    }),
  }),
  responses: { 200: { description: "통과했다" } },
  errors: [],
});
@Controller()
export class RateLimitFixtureController {
  constructor(@Inject(StrictLimiter) private readonly limiter: StrictLimiter) {}
  @Operation(protectedWrite)
  @HttpCode(200)
  async write(@JsonApiRequest() req: ValidatedRequest) {
    await this.limiter.enforce("password_change.user", req.principal?.userId ?? "anonymous");
    return { data: null };
  }
}
@Module({ controllers: [RateLimitFixtureController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class RateLimitFixtureModule {}
const principal: PrincipalResolver = {
  resolve: () =>
    Promise.resolve({
      userId: "fixture-user",
      sessionId: "fixture-session",
      permissions: new Set(),
    }),
};
export async function rateLimitFixtureApp(
  settings: Settings,
  redis: RedisClients,
  globalLimit = 600,
) {
  const configured = {
    ...settings,
    LOG_LEVEL: "error" as const,
    RATE_LIMIT_GLOBAL: globalLimit,
    RATE_LIMIT_PASSWORD_CHANGE_USER: 1,
    FORWARDED_ALLOW_IPS: [],
  };
  const strict = new StrictLimiter(redis, configured, new JsonLogger([]));
  return createApp(
    {
      settings: configured,
      imports: [
        {
          module: RateLimitFixtureModule,
          providers: [{ provide: StrictLimiter, useValue: strict }],
        },
      ],
      providers: [
        { provide: GLOBAL_LIMITER, useValue: createGlobalLimiter(redis, configured) },
        { provide: PRINCIPAL_RESOLVER, useValue: principal },
      ],
    },
    false,
  );
}
