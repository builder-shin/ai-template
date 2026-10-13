import { Global, Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module.js";
import { JobQueue } from "./queue.js";
@Global()
@Module({ imports: [RedisModule], providers: [JobQueue], exports: [JobQueue] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class JobsModule {}
