import {
  Global,
  Module,
  type DynamicModule,
  type LogLevel,
  type INestApplicationContext,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SETTINGS, type Settings } from "./core/config/settings.js";
import { DbModule } from "./core/db/db.module.js";
import { RedisModule } from "./core/redis/redis.module.js";
import { RateLimitModule } from "./core/ratelimit/ratelimit.module.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { GLOBAL_LIMITER, type GlobalLimiter } from "./core/http/pipeline.js";
import type { AppOverrides } from "./core/http/create-app.js";
import { HealthModule, HEALTH_CHECKS, databaseCheck, redisCheck } from "./modules/health/index.js";
import { PrismaService } from "./core/db/prisma.service.js";
import { RedisClients } from "./core/redis/clients.js";
import "./core/jsonapi/error-codes.js";
import "./core/security/permissions.js";
import "./core/config/locale.js";
import "./core/audit/actions.js";
import { PRINCIPAL_RESOLVER, UnavailablePrincipalResolver } from "./core/security/principal.js";
import { OperationGuard } from "./core/http/operation.guard.js";
import { IncludeRegistry } from "./core/jsonapi/include.js";
import { UsersModule } from "./modules/users/index.js";
import { AuthModule, JwtPrincipalResolver } from "./modules/auth/index.js";
import { registerDomain } from "./modules/registry.js";
import { RealtimeModule } from "./modules/realtime/index.js";

@Global()
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class AppModule {
  static registerDomain(app: INestApplicationContext): void {
    registerDomain(app);
  }
  static register(
    settings: Settings,
    logger: JsonLogger,
    overrides: AppOverrides,
    infrastructure: boolean,
  ): DynamicModule {
    const auth = AuthModule.register(infrastructure);
    return {
      module: AppModule,
      imports: [
        HealthModule,
        UsersModule,
        auth,
        RealtimeModule.register(infrastructure, auth),
        ...(infrastructure ? [DbModule, RedisModule, RateLimitModule] : []),
        ...(overrides.imports ?? []),
      ],
      providers: [
        { provide: SETTINGS, useValue: settings },
        { provide: JsonLogger, useValue: logger },
        ...(!infrastructure
          ? [
              {
                provide: GLOBAL_LIMITER,
                useValue: (() => Promise.resolve()) satisfies GlobalLimiter,
              },
            ]
          : []),
        IncludeRegistry,
        infrastructure
          ? { provide: PRINCIPAL_RESOLVER, useExisting: JwtPrincipalResolver }
          : { provide: PRINCIPAL_RESOLVER, useClass: UnavailablePrincipalResolver },
        { provide: APP_GUARD, useClass: OperationGuard },
        infrastructure
          ? {
              provide: HEALTH_CHECKS,
              inject: [PrismaService, RedisClients],
              useFactory: (prisma: PrismaService, redis: RedisClients) => [
                databaseCheck(prisma),
                redisCheck(redis),
              ],
            }
          : { provide: HEALTH_CHECKS, useValue: [] },
        ...(overrides.providers ?? []),
      ],
      exports: [
        SETTINGS,
        JsonLogger,
        ...(infrastructure ? [RateLimitModule] : [GLOBAL_LIMITER]),
        HEALTH_CHECKS,
        PRINCIPAL_RESOLVER,
        IncludeRegistry,
      ],
    };
  }
}

export function logLevels(level: Settings["LOG_LEVEL"]): LogLevel[] {
  const levels: Record<Settings["LOG_LEVEL"], LogLevel[]> = {
    debug: ["log", "error", "warn", "debug", "verbose", "fatal"],
    info: ["log", "error", "warn", "fatal"],
    warning: ["error", "warn", "fatal"],
    error: ["error", "fatal"],
  };
  return levels[level];
}
