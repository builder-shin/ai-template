import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import { RedisClients } from "../../core/redis/clients.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { RuntimeRealtimePublisher } from "../../core/realtime/emitter.js";
import type { RealtimeSocket } from "../../core/realtime/gateway-base.js";
import { Authenticator } from "../auth/index.js";
import type { Principal } from "../auth/index.js";
import { newToken, digest } from "../../core/security/tokens.js";
import { ApiError, isRecord } from "../../core/jsonapi/errors.js";
import { StrictRateLimiter } from "../../core/ratelimit/strict.js";
import { RealtimeAck } from "./schemas.js";
import type { z } from "zod";
@Injectable()
export class RealtimeService {
  private server?: Server;
  constructor(
    private readonly redis: RedisClients,
    private readonly auth: Authenticator,
    private readonly control: ControlChannel,
    private readonly publisher: RuntimeRealtimePublisher,
    private readonly limiter: StrictRateLimiter,
  ) {}
  async ticket(principal: Principal) {
    await this.limiter.check("realtime-ticket", principal.sessionId);
    const token = newToken(),
      expiresAt = new Date(Date.now() + 30000);
    await this.redis.command.set(
      `${this.redis.prefix}:ticket:${digest(token)}`,
      JSON.stringify({ userId: principal.userId, sessionId: principal.sessionId }),
      "EX",
      30,
    );
    return {
      data: {
        type: "realtime-tickets",
        id: randomUUID(),
        attributes: { token, expiresAt: expiresAt.toISOString() },
      },
    };
  }
  attach(server: Server): void {
    this.server = server;
    server.use((socket, next) => {
      void this.connect(socket as RealtimeSocket).then(
        () => {
          next();
        },
        () => {
          const error = new Error("auth.token_invalid") as Error & { data: unknown };
          error.data = new ApiError(401, "auth.token_invalid").toObject();
          next(error);
        },
      );
    });
    server.on("connection", (socket) => {
      const principal = (socket as RealtimeSocket).data.principal;
      if (principal)
        void socket.join([`user:${principal.userId}`, `session:${principal.sessionId}`]);
    });
  }
  async start(): Promise<void> {
    this.publisher.server = this.server;
    await this.control.start((id) => this.recheck(id));
  }
  private async connect(socket: RealtimeSocket): Promise<void> {
    const ticket: unknown = (socket.handshake.auth as Record<string, unknown>).ticket;
    if (ticket === undefined || ticket === null) return;
    if (typeof ticket !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      throw new Error("Invalid ticket.");
    const raw = await this.redis.command.getdel(`${this.redis.prefix}:ticket:${digest(ticket)}`);
    if (!raw) throw new Error("Expired ticket.");
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.userId !== "string" || typeof value.sessionId !== "string")
      throw new Error("Invalid ticket.");
    const principal = await this.auth.principalFor(value.userId, value.sessionId);
    if (!principal) throw new Error("Revoked session.");
    socket.data.principal = principal;
  }
  async subscription(
    socket: RealtimeSocket,
    payload: unknown,
    subscribe: boolean,
  ): Promise<z.infer<typeof RealtimeAck>> {
    if (!isRecord(payload) || (payload.channel !== "posts" && payload.channel !== "posts:all"))
      return {
        ok: false,
        error: new ApiError(422, "validation.invalid_choice", undefined, {
          pointer: "/channel",
        }).toObject(),
      };
    if (subscribe && payload.channel === "posts:all") {
      const saved = socket.data.principal;
      const principal = saved ? await this.auth.principalFor(saved.userId, saved.sessionId) : null;
      if (!principal?.permissions.has("posts:manage"))
        return { ok: false, error: new ApiError(403, "permission.denied").toObject() };
    }
    if (subscribe) await socket.join(payload.channel);
    else await socket.leave(payload.channel);
    return { ok: true };
  }
  async recheck(userId: string): Promise<void> {
    const server = this.server;
    if (!server) return;
    // Local sockets only: each API performs its own fresh DB check.
    const ids = server.of("/").adapter.rooms.get(`user:${userId}`) ?? new Set<string>();
    await Promise.all(
      [...ids].map(async (id) => {
        const socket = server.of("/").sockets.get(id) as RealtimeSocket | undefined;
        const saved = socket?.data.principal;
        if (!socket || !saved) return;
        try {
          const principal = await this.auth.principalFor(saved.userId, saved.sessionId);
          if (
            !principal ||
            (socket.rooms.has("posts:all") && !principal.permissions.has("posts:manage"))
          )
            socket.disconnect(true);
        } catch {
          /* A transient recheck failure preserves the connection. */
        }
      }),
    );
  }
}
