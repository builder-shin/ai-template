import { Module } from "@nestjs/common";
import { HealthController } from "./controller.js";
@Module({ controllers: [HealthController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class HealthModule {}
