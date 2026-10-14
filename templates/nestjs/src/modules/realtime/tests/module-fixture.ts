import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../app.module.js";
import { SETTINGS } from "../../../core/config/settings.js";
import { settings } from "../../../core/http/tests/fixtures.js";
import { PrismaService } from "../../../core/db/prisma.service.js";
import type { Tx } from "../../../core/db/unit-of-work.js";
import { RedisClients } from "../../../core/redis/clients.js";
import { redisFixture } from "../../../core/realtime/tests/redis-fixture.js";
import { JobQueue } from "../../../core/jobs/queue.js";
import { MailSender } from "../../../core/mail/sender.js";
import { StrictLimiter } from "../../../core/ratelimit/strict.js";
import { GLOBAL_LIMITER, pipeline } from "../../../core/http/pipeline.js";
import { ApiExceptionFilter } from "../../../core/http/exception.filter.js";
import { DocumentInterceptor } from "../../../core/http/document.interceptor.js";
import { JsonLogger } from "../../../core/logging/json-logger.js";
import { PasswordBootstrap } from "../../../core/security/passwords.js";
import { RealtimeIoAdapter } from "../../../core/realtime/adapter.js";
import {
  AuthRepository,
  SessionsRepository,
  type AuthUser,
  type SessionRow,
} from "../../auth/index.js";
import { RolesRepository } from "../../roles/index.js";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { expect } from "vitest";
export const graphPrincipal = {
  userId: "01900000-0000-7000-8000-000000000001",
  sessionId: "01900000-0000-7000-8000-000000000002",
  permissions: new Set(["posts:manage"] as const),
};
export async function moduleFixture() {
  const redis = redisFixture();
  const logger = new JsonLogger([]);
  const at = new Date();
  const user: AuthUser = {
    id: graphPrincipal.userId,
    email: "graph@example.test",
    passwordHash: null,
    name: "그래프 회원",
    locale: "ko",
    status: "active",
    emailVerifiedAt: at,
    createdAt: at,
  };
  const session: SessionRow = {
    id: graphPrincipal.sessionId,
    userId: user.id,
    authenticatedAt: at,
    createdAt: at,
    lastUsedAt: at,
    expiresAt: new Date(at.getTime() + 60000),
    revokedAt: null,
    revokedReason: null,
    userAgent: null,
  };
  class MemoryUsers extends AuthRepository {
    override findById(_tx: Tx, id: string) {
      return Promise.resolve(id === user.id ? user : null);
    }
  }
  class MemorySessions extends SessionsRepository {
    override find(_tx: Tx, id: string) {
      return Promise.resolve(id === session.id ? session : null);
    }
  }
  class MemoryRoles extends RolesRepository {
    override permissionsOf(_tx: Tx, id: string) {
      if (id !== user.id) throw new Error("다른 사용자의 권한을 조회했다");
      return Promise.resolve(graphPrincipal.permissions);
    }
  }
  const module = await Test.createTestingModule({
    imports: [AppModule.register(settings, logger, {}, true)],
  })
    .overrideProvider(SETTINGS)
    .useValue(settings)
    .overrideProvider(PrismaService)
    .useValue({ $transaction: (fn: (tx: Tx) => Promise<unknown>) => fn({} as Tx) })
    .overrideProvider(RedisClients)
    .useValue(redis.redis)
    .overrideProvider(JobQueue)
    .useValue({ enqueue: () => {} })
    .overrideProvider(MailSender)
    .useValue({ send: () => Promise.resolve() })
    .overrideProvider(StrictLimiter)
    .useValue({ enforce: () => Promise.resolve() })
    .overrideProvider(GLOBAL_LIMITER)
    .useValue(() => Promise.resolve())
    .overrideProvider(PasswordBootstrap)
    .useValue({ onModuleInit: () => Promise.resolve() })
    .overrideProvider(AuthRepository)
    .useValue(new MemoryUsers())
    .overrideProvider(SessionsRepository)
    .useValue(new MemorySessions())
    .overrideProvider(RolesRepository)
    .useValue(new MemoryRoles())
    .compile();
  const app = module.createNestApplication({
    logger: false,
    bodyParser: false,
    routeConflictPolicy: { duplicate: "error", shadow: "warn" },
  });
  const filter = new ApiExceptionFilter(logger);
  app.use(pipeline(logger, filter, () => Promise.resolve()));
  app.useGlobalFilters(filter);
  app.useGlobalInterceptors(new DocumentInterceptor());
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, settings.REALTIME_ALLOWED_ORIGINS));
  const server = app.getHttpServer() as Server;
  return {
    app,
    server,
    async start() {
      await app.listen(0, "127.0.0.1");
      AppModule.registerDomain(app);
      return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    },
    async close() {
      await app.close();
      expect(server.listening).toBe(false);
      expect(server.address()).toBeNull();
      expect(redis.subscriber.listenerCount("message")).toBe(0);
      expect(redis.channels.size).toBe(0);
    },
  };
}
