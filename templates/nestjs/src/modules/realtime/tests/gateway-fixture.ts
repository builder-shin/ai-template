import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { io, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { expect } from "vitest";
import type { Principal } from "../../../core/security/principal.js";
import { JsonLogger } from "../../../core/logging/json-logger.js";
import { TicketStore } from "../../../core/realtime/tickets.js";
import { RuntimeRealtimePublisher } from "../../../core/realtime/publisher.js";
import { ControlChannel } from "../../../core/realtime/control-channel.js";
import { RealtimeIoAdapter } from "../../../core/realtime/adapter.js";
import { redisFixture } from "../../../core/realtime/tests/redis-fixture.js";
import type { JwtPrincipalResolver } from "../../auth/index.js";
import type { Server } from "node:http";
import { RealtimeGateway, SessionRecheck } from "../index.js";
import { OperationGuard } from "../../../core/http/operation.guard.js";
import { DocumentInterceptor } from "../../../core/http/document.interceptor.js";
import { PRINCIPAL_RESOLVER } from "../../../core/security/principal.js";
export const member: Principal = { userId: "member", sessionId: "session", permissions: new Set() };
export async function gatewayFixture(
  read: (principal: Principal) => Promise<Principal> = (p) => Promise.resolve(p),
) {
  const redis = redisFixture();
  const tickets = new TicketStore(redis.redis);
  const publisher = new RuntimeRealtimePublisher(redis.redis);
  const logger = new JsonLogger([]);
  const control = new ControlChannel(redis.redis, logger);
  const resolver = { resolveSession: read } as unknown as JwtPrincipalResolver;
  const recheck = new SessionRecheck(resolver, logger);
  const module = await Test.createTestingModule({
    providers: [
      { provide: APP_GUARD, useClass: OperationGuard },
      {
        provide: PRINCIPAL_RESOLVER,
        useValue: { resolve: () => Promise.reject(new Error("HTTP 인증을 소켓에서 실행했다")) },
      },
      RealtimeGateway,
      { provide: TicketStore, useValue: tickets },
      { provide: RuntimeRealtimePublisher, useValue: publisher },
      { provide: ControlChannel, useValue: control },
      { provide: SessionRecheck, useValue: recheck },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalInterceptors(new DocumentInterceptor());
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, ["https://example.com"]));
  await app.listen(0, "127.0.0.1");
  const server = app.getHttpServer() as Server;
  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${String(address.port)}`;
  const clients: ClientSocket[] = [];
  function client(options: Parameters<typeof io>[1] = {}) {
    const socket = io(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 1000,
      autoConnect: false,
      ...options,
    });
    clients.push(socket);
    return socket;
  }
  async function connect(principal?: Principal, options: Parameters<typeof io>[1] = {}) {
    const socket = client({
      ...options,
      ...(principal ? { auth: { ticket: await tickets.issue(principal) } } : {}),
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    return socket;
  }
  async function error(options: Parameters<typeof io>[1]) {
    const socket = client(options);
    return new Promise<Error & { data?: unknown }>((resolve, reject) => {
      socket.once("connect_error", resolve);
      socket.once("connect", () => {
        reject(new Error("연결을 거절하지 않았다"));
      });
      socket.connect();
    });
  }
  const gateway = app.get(RealtimeGateway);
  return {
    app,
    server,
    redis,
    tickets,
    publisher,
    control,
    recheck,
    logger,
    url,
    connect,
    error,
    rooms: (socket: ClientSocket) => gateway.server?.sockets.sockets.get(socket.id ?? "")?.rooms,
    async close() {
      for (const socket of clients) socket.disconnect();
      await app.close();
      expect(server.listening).toBe(false);
      expect(redis.subscriber.listenerCount("message")).toBe(0);
    },
  };
}
export function emitAck(
  socket: ClientSocket,
  event: string,
  ...payload: unknown[]
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.timeout(1000).emit(event, ...payload, (error: Error | null, ack: unknown) => {
      if (error) reject(error);
      else resolve(ack);
    });
  });
}
