import { Global, Module, type DynamicModule, type LogLevel } from "@nestjs/common";
import { SETTINGS, type Settings } from "./core/config/settings.js";
import { DbModule } from "./core/db/db.module.js";
import { RedisModule } from "./core/redis/redis.module.js";
import { JsonLogger } from "./core/logging/json-logger.js";
import { GLOBAL_LIMITER, type GlobalLimiter } from "./core/http/pipeline.js";
import type { AppOverrides } from "./core/http/create-app.js";

@Global()
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class AppModule {
  static register(
    settings: Settings,
    logger: JsonLogger,
    overrides: AppOverrides,
    infrastructure: boolean,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [...(infrastructure ? [DbModule, RedisModule] : []), ...(overrides.imports ?? [])],
      providers: [
        { provide: SETTINGS, useValue: settings },
        { provide: JsonLogger, useValue: logger },
        { provide: GLOBAL_LIMITER, useValue: (() => Promise.resolve()) satisfies GlobalLimiter },
        ...(overrides.providers ?? []),
      ],
      exports: [SETTINGS, JsonLogger, GLOBAL_LIMITER],
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
