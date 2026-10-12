import { Global, Module } from "@nestjs/common";
import { RedisClients } from "./clients.js";
import { StrictRateLimiter } from "../ratelimit/strict.js";
import { GlobalRateLimitMiddleware } from "../ratelimit/global.middleware.js";
import { JobQueue } from "../jobs/queue.js";
import { Schedulers } from "../jobs/schedulers.js";
import { ControlChannel } from "../realtime/control-channel.js";
import { RuntimeRealtimePublisher } from "../realtime/emitter.js";
import { RealtimePublisher, RecordingRealtimePublisher } from "../realtime/publisher.js";
@Global()
@Module({
  providers: [
    RedisClients,
    StrictRateLimiter,
    GlobalRateLimitMiddleware,
    JobQueue,
    Schedulers,
    ControlChannel,
    RuntimeRealtimePublisher,
    RecordingRealtimePublisher,
    { provide: RealtimePublisher, useExisting: RuntimeRealtimePublisher },
  ],
  exports: [
    RedisClients,
    StrictRateLimiter,
    GlobalRateLimitMiddleware,
    JobQueue,
    Schedulers,
    ControlChannel,
    RealtimePublisher,
    RuntimeRealtimePublisher,
    RecordingRealtimePublisher,
  ],
})
export class RedisModule {}
