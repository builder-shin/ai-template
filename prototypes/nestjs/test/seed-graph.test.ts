import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { expect, it } from "vitest";
import { SETTINGS, loadSettings } from "../src/core/config/settings.js";
import { PrismaService } from "../src/core/db/prisma.service.js";
import { UnitOfWork } from "../src/core/db/unit-of-work.js";
import { RedisClients } from "../src/core/redis/clients.js";
import { RealtimePublisher } from "../src/core/realtime/publisher.js";
import { RuntimeRealtimePublisher } from "../src/core/realtime/emitter.js";
import { Storage } from "../src/core/storage/client.js";
import { PostsService } from "../src/modules/posts/index.js";
import { RolesService } from "../src/modules/roles/index.js";
import { UsersService } from "../src/modules/users/index.js";
import { SeedModule } from "../src/seed.js";

it("compiles the actual seed graph with the realtime provider required by posts", async () => {
  // Compile only: infrastructure constructors are replaced and no seed/init/query runs.
  const app = await Test.createTestingModule({ imports: [SeedModule] })
    .overrideProvider(SETTINGS)
    .useValue(loadSettings({}))
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(Storage)
    .useValue({})
    .overrideProvider(RedisClients)
    .useValue({
      prefix: "aitpl:0",
      subscriber: {
        off: () => undefined,
        unsubscribe: () => Promise.resolve(0),
      },
    })
    .compile();
  try {
    expect(app.get(PostsService)).toBeInstanceOf(PostsService);
    expect(app.get(RolesService)).toBeInstanceOf(RolesService);
    expect(app.get(UsersService)).toBeInstanceOf(UsersService);
    expect(app.get(UnitOfWork)).toBeInstanceOf(UnitOfWork);
    expect(app.get(RealtimePublisher)).toBeInstanceOf(RuntimeRealtimePublisher);
  } finally {
    await app.close();
  }
});
