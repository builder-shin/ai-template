import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { AddressInfo } from "node:net";
import type { Settings } from "../../src/core/config/settings.js";
import { RedisClients } from "../../src/core/redis/clients.js";
import { RealtimeIoAdapter } from "../../src/core/realtime/adapter.js";
import { RuntimeRealtimePublisher } from "../../src/core/realtime/publisher.js";
import { ControlChannel } from "../../src/core/realtime/control-channel.js";
import { JsonLogger } from "../../src/core/logging/json-logger.js";
import { createApp } from "../../src/core/http/create-app.js";
import { JwtPrincipalResolver } from "../../src/modules/auth/index.js";
import { RealtimeGateway } from "../../src/modules/realtime/index.js";
import { z } from "zod";
const command = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("init"),
    id: z.number(),
    role: z.enum(["api", "emitter"]),
    settings: z.custom<Settings>(),
  }),
  z.object({
    kind: z.literal("emit"),
    id: z.number(),
    rooms: z.array(z.string()),
    payload: z.unknown(),
  }),
  z.object({ kind: z.literal("recheck"), id: z.number(), userId: z.string() }),
  z.object({ kind: z.literal("fail-db"), id: z.number(), enabled: z.boolean() }),
  z.object({ kind: z.literal("rooms"), id: z.number(), socketId: z.string() }),
  z.object({ kind: z.literal("stop"), id: z.number() }),
]);
let app: NestExpressApplication | undefined;
let redis: RedisClients | undefined;
let publisher: RuntimeRealtimePublisher | undefined;
let control: ControlChannel | undefined;
let failDb = false;
async function execute(input: z.infer<typeof command>): Promise<unknown> {
  if (input.kind === "init") {
    if (app || redis) throw new Error("시험 프로세스를 두 번 초기화했다");
    if (
      new URL(input.settings.REDIS_URL).pathname !== "/15" ||
      new URL(input.settings.DATABASE_URL).pathname !== "/app_test"
    )
      throw new Error("시험 DB 범위를 벗어났다");
    if (input.role === "api") {
      app = await createApp(
        {
          settings: { ...input.settings, LOG_LEVEL: "error" },
          configure: (app) => {
            app.useWebSocketAdapter(
              new RealtimeIoAdapter(
                app,
                input.settings.REALTIME_ALLOWED_ORIGINS,
                app.get<RedisClients>(RedisClients),
              ),
            );
          },
        },
        true,
      );
      const resolver = app.get(JwtPrincipalResolver);
      const read = resolver.resolveSession.bind(resolver);
      resolver.resolveSession = (p) =>
        failDb ? Promise.reject(new Error("주입한 DB 읽기 실패")) : read(p);
      const logger = app.get(JsonLogger);
      logger.warn = () => {
        process.send?.({ kind: "warning" });
      };
      await app.listen(0, "127.0.0.1");
      publisher = app.get(RuntimeRealtimePublisher);
      control = app.get(ControlChannel);
      return { pid: process.pid, port: (app.getHttpServer().address() as AddressInfo).port };
    }
    redis = new RedisClients(input.settings);
    publisher = new RuntimeRealtimePublisher(redis);
    control = new ControlChannel(redis, new JsonLogger([]));
    return { pid: process.pid };
  }
  if (input.kind === "emit") {
    if (!publisher) throw new Error("시험 발행기가 없다");
    const hooks: (() => Promise<void> | void)[] = [];
    publisher.queue(
      (h) => {
        hooks.push(h);
      },
      "post.created",
      input.rooms,
      () => input.payload,
    );
    for (const hook of hooks) await hook();
    return null;
  }
  if (input.kind === "recheck") {
    if (!control) throw new Error("시험 제어 채널이 없다");
    await control.publishRecheck(input.userId);
    return null;
  }
  if (input.kind === "fail-db") {
    failDb = input.enabled;
    return null;
  }
  if (input.kind === "rooms") {
    return [
      ...(app?.get(RealtimeGateway).server?.sockets.sockets.get(input.socketId)?.rooms ?? []),
    ];
  }
  await app?.close();
  await redis?.close();
  return null;
}
process.on("message", (message: unknown) => {
  const parsed = command.safeParse(message);
  if (!parsed.success) {
    process.exitCode = 1;
    process.disconnect();
    return;
  }
  void execute(parsed.data).then(
    (value) => {
      process.send?.({ kind: "reply", id: parsed.data.id, value }, () => {
        if (parsed.data.kind === "stop") process.disconnect();
      });
    },
    () => {
      process.send?.({
        kind: "reply",
        id: parsed.data.id,
        error: "실시간 시험 프로세스 요청에 실패했다",
      });
    },
  );
});
