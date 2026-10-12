import { Module } from "@nestjs/common";
import { UsersModule } from "../users/index.js";
import { FilesModule } from "../files/index.js";
import { PostsRepository } from "./repository.js";
import { PostsService } from "./service.js";
import { PostsController } from "./controller.js";
import { PostEvents } from "./events.js";
@Module({
  imports: [UsersModule, FilesModule],
  providers: [PostsRepository, PostsService, PostEvents],
  controllers: [PostsController],
  exports: [PostsService],
})
export class PostsModule {}
