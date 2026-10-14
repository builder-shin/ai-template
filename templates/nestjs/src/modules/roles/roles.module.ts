import { Module, type DynamicModule } from "@nestjs/common";
import { RolesController } from "./controller.js";
import { RolesRepository } from "./repository.js";
import { RolesService } from "./service.js";
import { RolesAdminService } from "./admin.service.js";
@Module({
  providers: [RolesRepository],
  exports: [RolesRepository],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class RolesModule {
  static register(infrastructure: boolean, dependencies: readonly DynamicModule[]): DynamicModule {
    const unavailable = (): never => {
      throw new Error("인프라가 없는 앱에서는 역할 관리 작업을 실행할 수 없다");
    };
    return {
      module: RolesModule,
      imports: infrastructure ? [...dependencies] : [],
      controllers: [RolesController],
      providers: [
        RolesService,
        infrastructure
          ? RolesAdminService
          : {
              provide: RolesAdminService,
              useValue: {
                list: unavailable,
                get: unavailable,
                create: unavailable,
                update: unavailable,
                delete: unavailable,
              } satisfies Pick<RolesAdminService, "list" | "get" | "create" | "update" | "delete">,
            },
      ],
      exports: [RolesAdminService],
    };
  }
}
