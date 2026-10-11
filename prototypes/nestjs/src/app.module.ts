import { Module } from "@nestjs/common";
import { DbModule } from "./core/db/db.module.js";
import { HealthModule } from "./modules/health/index.js";
import { RolesModule } from "./modules/roles/index.js";
import { UsersModule } from "./modules/users/index.js";
import { AuthModule } from "./modules/auth/index.js";
import { FilesModule } from "./modules/files/index.js";
import { PostsModule } from "./modules/posts/index.js";
@Module({
  imports: [DbModule, HealthModule, RolesModule, UsersModule, AuthModule, FilesModule, PostsModule],
})
export class AppModule {}
