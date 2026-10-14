import { Module, type DynamicModule } from "@nestjs/common";
import { AuditLogsController } from "./controller.js";
import { AuditLogsRepository } from "./repository.js";
import { AuditLogsService } from "./service.js";
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class AuditLogsModule {
  static register(infrastructure: boolean): DynamicModule {
    const unavailable = (): never => {
      throw new Error("인프라가 없는 앱에서는 감사 로그를 조회할 수 없다");
    };
    return {
      module: AuditLogsModule,
      controllers: [AuditLogsController],
      providers: [
        AuditLogsRepository,
        infrastructure
          ? AuditLogsService
          : {
              provide: AuditLogsService,
              useValue: { list: unavailable, get: unavailable } satisfies Pick<
                AuditLogsService,
                "list" | "get"
              >,
            },
      ],
      exports: [AuditLogsService],
    };
  }
}
