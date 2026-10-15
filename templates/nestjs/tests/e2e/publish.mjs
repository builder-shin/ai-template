import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../dist/app.module.js";
import { loadSettings } from "../../dist/core/config/settings.js";
import { JsonLogger } from "../../dist/core/logging/json-logger.js";
import { JobsModule } from "../../dist/core/jobs/jobs.module.js";
import { WorkerHost } from "../../dist/core/jobs/worker-host.js";
import { MailModule } from "../../dist/core/mail/mail.module.js";
import { drainBeforeClose } from "../../dist/core/runtime/context-shutdown.js";
import { PostsService } from "../../dist/modules/posts/index.js";
let stage = "bootstrap";
let app;
try {
  // 이 별도 worker는 실패 원문을 출력하지 않고 정해진 단계 이름만 남긴다.
  app = await NestFactory.createApplicationContext(
    AppModule.register(
      loadSettings(),
      new JsonLogger([]),
      { imports: [JobsModule, MailModule], providers: [WorkerHost] },
      true,
    ),
    { logger: false, abortOnError: false },
  );
  drainBeforeClose(app, () => app.get(WorkerHost).onModuleDestroy());
  stage = "register";
  AppModule.registerDomain(app);
  await app.get(WorkerHost).start();
  const service = app.get(PostsService);
  stage = "update";
  await service.update(
    { userId: process.argv[3], sessionId: process.argv[4], permissions: new Set() },
    process.argv[2],
    { attributes: { status: "published" } },
  );
} catch {
  process.stderr.write(`${stage}\n`);
  process.exitCode = 1;
} finally {
  stage = "close";
  try {
    await app?.close();
  } catch {
    process.stderr.write(`${stage}\n`);
    process.exitCode = 1;
  }
}
