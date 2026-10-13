import { Global, Module } from "@nestjs/common";
import { RedisClients } from "./clients.js";
@Global()
@Module({ providers: [RedisClients], exports: [RedisClients] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class RedisModule {}
