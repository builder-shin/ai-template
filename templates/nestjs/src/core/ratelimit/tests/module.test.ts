import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { expect, it } from "vitest";
import { AppModule } from "../../../app.module.js";
import { settings } from "../../http/tests/fixtures.js";
import { JsonLogger } from "../../logging/json-logger.js";
import { RedisClients } from "../../redis/clients.js";
import { PrismaService } from "../../db/prisma.service.js";
import { JobQueue } from "../../jobs/queue.js";
import { MailSender } from "../../mail/sender.js";
import { GLOBAL_LIMITER, type GlobalLimiter } from "../../http/pipeline.js";
import { StrictLimiter } from "../strict.js";
import { incoming, store } from "./fixtures.js";
it("운영 모듈은 실제 전역과 엄격 리미터를 DI로 제공한다", async () => {
  const { clients } = store([3, 42]);
  const module = await Test.createTestingModule({
    imports: [
      AppModule.register(
        { ...settings, RATE_LIMIT_GLOBAL: 2, RATE_LIMIT_LOGIN_IP: 2 },
        new JsonLogger([]),
        {},
        true,
      ),
    ],
  })
    .overrideProvider(RedisClients)
    .useValue(clients)
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(JobQueue)
    .useValue({})
    .overrideProvider(MailSender)
    .useValue({})
    .compile();
  try {
    await expect(module.get<GlobalLimiter>(GLOBAL_LIMITER)(incoming())).rejects.toMatchObject({
      init: { status: 429 },
    });
    await expect(
      module.get(StrictLimiter).enforce("login.ip", "203.0.113.9"),
    ).rejects.toMatchObject({ init: { status: 429 } });
  } finally {
    await module.close();
  }
});
