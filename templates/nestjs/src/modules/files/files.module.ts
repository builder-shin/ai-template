import { Module, type DynamicModule } from "@nestjs/common";
import { FilesController } from "./controller.js";
import { FilesService } from "./service.js";
import { FilesRepository, type FileReferenceRule } from "./repository.js";
function unavailable(): never {
  throw new Error("인프라가 없는 앱에서는 파일 작업을 실행할 수 없다");
}
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class FilesModule {
  static register(
    infrastructure: boolean,
    references: readonly FileReferenceRule[] = [],
  ): DynamicModule {
    return {
      module: FilesModule,
      controllers: [FilesController],
      providers: infrastructure
        ? [
            FilesService,
            { provide: FilesRepository, useFactory: () => new FilesRepository([...references]) },
          ]
        : [
            {
              provide: FilesService,
              useValue: {
                create: unavailable,
                get: unavailable,
                complete: unavailable,
                delete: unavailable,
              } satisfies Pick<FilesService, "create" | "get" | "complete" | "delete">,
            },
          ],
      exports: [FilesService],
    };
  }
}
