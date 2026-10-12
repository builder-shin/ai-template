import { UnitOfWork } from "./core/db/unit-of-work.js";
import { loadSettings } from "./core/config/settings.js";
import { RolesModule, RolesService } from "./modules/roles/index.js";
import { UsersModule, UsersService } from "./modules/users/index.js";
import { PostsModule, PostsService } from "./modules/posts/index.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NestFactory } from "@nestjs/core";
import { DbModule } from "./core/db/db.module.js";
import { RedisModule } from "./core/redis/redis.module.js";
import { Module } from "@nestjs/common";
@Module({ imports: [DbModule, RedisModule, RolesModule, UsersModule, PostsModule] })
export class SeedModule {}
export async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: false });
  try {
    const settings = loadSettings(process.env),
      users = app.get(UsersService),
      roles = app.get(RolesService);
    await app.get(UnitOfWork).run(
      async (tx) => {
        await roles.seed(tx);
        let user = await users.find(settings.SEED_ADMIN_EMAIL, tx);
        user ??= await users.create(tx, {
          email: settings.SEED_ADMIN_EMAIL,
          password: settings.SEED_ADMIN_PASSWORD,
          name: "Administrator",
          locale: "ko",
          verified: true,
        });
        await roles.assign(tx, user.id, ["admin"]);
        await app.get(PostsService).ensureExamples(tx, user.id);
      },
      { timeout: 15000 },
    );
  } finally {
    await app.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await seed();
