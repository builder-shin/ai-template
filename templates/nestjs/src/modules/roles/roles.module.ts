import { Module } from "@nestjs/common";
import { RolesController } from "./controller.js";
import { RolesRepository } from "./repository.js";
import { RolesService } from "./service.js";
@Module({
  controllers: [RolesController],
  providers: [RolesRepository, RolesService],
  exports: [RolesRepository],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class RolesModule {}
