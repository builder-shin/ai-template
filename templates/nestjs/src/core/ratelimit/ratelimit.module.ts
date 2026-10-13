import { Global, Module } from "@nestjs/common";
import { SETTINGS, type Settings } from "../config/settings.js";
import { RedisClients } from "../redis/clients.js";
import { GLOBAL_LIMITER } from "../http/pipeline.js";
import { createGlobalLimiter } from "./global.js";
import { StrictLimiter } from "./strict.js";

@Global()
@Module({
  providers: [
    StrictLimiter,
    {
      provide: GLOBAL_LIMITER,
      inject: [RedisClients, SETTINGS],
      useFactory: (redis: RedisClients, settings: Settings) => createGlobalLimiter(redis, settings),
    },
  ],
  exports: [StrictLimiter, GLOBAL_LIMITER],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class RateLimitModule {}
