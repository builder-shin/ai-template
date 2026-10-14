import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { WebSocketGateway } from "@nestjs/websockets";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { Server as SocketServer } from "socket.io";
import type { Server } from "node:http";
import { expect, it, vi } from "vitest";
import { RedisClients } from "../../redis/clients.js";
import { SETTINGS } from "../../config/settings.js";
@WebSocketGateway()
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- 종료 순서만 검증하는 인메모리 Nest 게이트웨이다
class ShutdownGateway {}
it("Socket.IO 어댑터를 닫은 다음 공유 Redis 연결을 닫는다", async () => {
  const order: string[] = [];
  const module = await Test.createTestingModule({
    providers: [
      ShutdownGateway,
      RedisClients,
      { provide: SETTINGS, useValue: { REDIS_URL: "redis://fixture.invalid:26379/15" } },
    ],
  }).compile();
  const redis = module.get(RedisClients);
  const close = redis.close.bind(redis);
  const closed = vi.spyOn(redis, "close").mockImplementation(() => {
    order.push("redis");
    return close();
  });
  class ShutdownAdapter extends IoAdapter {
    override async close(server: SocketServer): Promise<void> {
      order.push("socket");
      await super.close(server);
    }
  }
  const app = module.createNestApplication({ logger: false });
  app.useWebSocketAdapter(new ShutdownAdapter(app));
  const server = app.getHttpServer() as Server;
  try {
    await app.listen(0, "127.0.0.1");
    await app.close();
    expect(order).toEqual(["socket", "redis"]);
  } finally {
    closed.mockRestore();
    await close();
    if (server.listening) await app.close();
  }
  expect(server.listening).toBe(false);
  expect(server.address()).toBeNull();
  expect(redis.subscriber.status).toBe("end");
});
