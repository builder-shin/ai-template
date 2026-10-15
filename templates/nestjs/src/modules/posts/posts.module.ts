import { Module, type DynamicModule } from "@nestjs/common";
import { CacheAside } from "../../core/cache/cache.js";
import { PostsService } from "./service.js";
import { PostsRepository } from "./repository.js";
import { PostsController } from "./controller.js";
function unavailable(): never {
  throw new Error("인프라가 없는 앱에서는 글 작업을 실행할 수 없다");
}
@Module({})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest DI 모듈은 선언용 클래스를 사용한다
export class PostsModule {
  static register(infrastructure: boolean, dependencies: readonly DynamicModule[]): DynamicModule {
    return {
      module: PostsModule,
      imports: infrastructure ? [...dependencies] : [],
      controllers: [PostsController],
      providers: [
        PostsRepository,
        ...(infrastructure
          ? [CacheAside, PostsService]
          : [
              {
                provide: PostsService,
                useValue: {
                  list: unavailable,
                  get: unavailable,
                  create: unavailable,
                  update: unavailable,
                  delete: unavailable,
                } satisfies Pick<PostsService, "list" | "get" | "create" | "update" | "delete">,
              },
            ]),
      ],
      exports: [PostsRepository, PostsService],
    };
  }
}
