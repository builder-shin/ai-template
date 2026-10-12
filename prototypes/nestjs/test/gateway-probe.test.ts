import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Socket as ServerSocket } from "socket.io";
import { io } from "socket.io-client";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { RealtimeAck } from "../src/modules/realtime/schemas.js";
import { ApiError, isRecord } from "../src/core/jsonapi/errors.js";
const observed: unknown[] = [];
function result(payload: unknown) {
  if (!isRecord(payload) || !["posts", "posts:all"].includes(String(payload.channel)))
    return {
      ok: false,
      error: new ApiError(422, "validation.invalid_choice", undefined, {
        pointer: "/channel",
      }).toObject(),
    };
  return payload.channel === "posts:all"
    ? { ok: false, error: new ApiError(403, "permission.denied").toObject() }
    : { ok: true };
}
@WebSocketGateway({ path: "/socket.io", transports: ["websocket"] })
class ProbeGateway {
  @SubscribeMessage("subscribe")
  subscribe(socket: ServerSocket, payload: unknown, ack: unknown) {
    return this.handle("subscribe", socket, payload, ack);
  }
  @SubscribeMessage("unsubscribe")
  unsubscribe(socket: ServerSocket, payload: unknown, ack: unknown) {
    return this.handle("unsubscribe", socket, payload, ack);
  }
  handle(event: string, socket: ServerSocket, payload: unknown, ack: unknown) {
    observed.push({
      event,
      socket: typeof socket.emit,
      payload: payload === undefined ? { literal: "undefined" } : payload,
      ack: typeof ack,
    });
    if (isRecord(payload) && payload.return === "null") return null;
    if (isRecord(payload) && payload.return === "undefined") return undefined;
    return result(payload);
  }
}
@Module({ providers: [ProbeGateway] })
class ProbeModule {}
it("measures actual pinned gateway argument and ACK mapping over loopback", async () => {
  const app = await NestFactory.create(ProbeModule, { logger: false });
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(0, "127.0.0.1");
  const socket = io(await app.getUrl(), { transports: ["websocket"] });
  const rows: unknown[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    for (const event of ["subscribe", "unsubscribe"]) {
      for (const [name, payloads] of [
        ["zero", []],
        ["two", [{ channel: "posts" }, { channel: "posts" }]],
        ["array", [[{ channel: "posts" }]]],
        ["object", [{ channel: "posts" }]],
        ["unknown", [{ channel: "unknown" }]],
        ["missing", [{}]],
        ["permissionless", [{ channel: "posts:all" }]],
        ["null", [{ return: "null" }]],
        ["undefined", [{ return: "undefined" }]],
      ] as const) {
        const ack = await new Promise<unknown>((resolve) => {
          socket.timeout(100).emit(event, ...payloads, (error: Error | null, value: unknown) => {
            resolve(error ? { arrived: false } : { arrived: true, value });
          });
        });
        rows.push({ event, name, sent: payloads, handler: observed.at(-1), client: ack });
        if (name === "null" || name === "undefined") expect(ack).toEqual({ arrived: false });
        else {
          const value = (ack as { arrived: boolean; value: unknown }).value;
          expect((ack as { arrived: boolean }).arrived).toBe(true);
          expect(RealtimeAck.parse(value)).toEqual(
            result(payloads.length === 1 ? payloads[0] : undefined),
          );
        }
        expect(observed.at(-1)).toMatchObject({
          payload:
            payloads.length === 0
              ? { literal: "undefined" }
              : payloads.length === 1
                ? payloads[0]
                : payloads,
        });
        expect(observed).toHaveLength(rows.length);
      }
    }
    mkdirSync(".cache/realtime", { recursive: true });
    writeFileSync(
      ".cache/realtime/pinned-gateway.json",
      JSON.stringify({ pins: { nest: "12.1.2", client: "4.8.4" }, rows }, null, 2),
    );
    console.log(JSON.stringify({ pinnedGateway: rows }));
    expect(rows).toHaveLength(18);
  } finally {
    socket.close();
    await app.close();
  }
});
