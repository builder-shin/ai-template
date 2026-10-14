import { Module, type DynamicModule } from "@nestjs/common";
import { RolesModule } from "../roles/index.js";
import { UsersRepository } from "./repository.js";
import { MeService } from "./me.service.js";
import { MeController } from "./me.controller.js";
import { MeRealtimeBridge } from "./events.js";
import { UsersAdminService } from "./admin.service.js";
import { UsersAdminController } from "./admin.controller.js";
function unavailable(): never {
  throw new Error("인프라가 없는 앱에서는 내 정보 작업을 실행할 수 없다");
}
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class UsersModule {
  static register(infrastructure: boolean, dependencies: readonly DynamicModule[]): DynamicModule {
    return {
      module: UsersModule,
      imports: [RolesModule, ...(infrastructure ? dependencies : [])],
      controllers: [MeController, UsersAdminController],
      providers: [
        UsersRepository,
        ...(infrastructure
          ? [MeService, MeRealtimeBridge, UsersAdminService]
          : [
              {
                provide: UsersAdminService,
                useValue: {
                  list: unavailable,
                  get: unavailable,
                  update: unavailable,
                } satisfies Pick<UsersAdminService, "list" | "get" | "update">,
              },
              {
                provide: MeService,
                useValue: {
                  get: unavailable,
                  update: unavailable,
                  delete: unavailable,
                } satisfies Pick<MeService, "get" | "update" | "delete">,
              },
              {
                provide: MeRealtimeBridge,
                useValue: { register: () => {} } satisfies Pick<MeRealtimeBridge, "register">,
              },
            ]),
      ],
      exports: [UsersRepository, MeService, MeRealtimeBridge, UsersAdminService],
    };
  }
}
