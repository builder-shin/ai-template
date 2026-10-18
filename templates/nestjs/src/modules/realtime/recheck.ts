import { Inject, Injectable } from "@nestjs/common";
import type { Principal } from "../../core/security/principal.js";
import { JwtPrincipalResolver } from "../auth/index.js";
import type { Server, Socket } from "socket.io";
import { JsonLogger } from "../../core/logging/json-logger.js";
import { ApiError } from "../../core/jsonapi/errors.js";
export interface SocketData {
  principal?: Principal;
}
export type RealtimeEvents = Record<string, (...args: unknown[]) => void>;
export type RealtimeSocket = Socket<RealtimeEvents, RealtimeEvents, RealtimeEvents, SocketData>;
export type RealtimeServer = Server<RealtimeEvents, RealtimeEvents, RealtimeEvents, SocketData>;
@Injectable()
export class SessionRecheck {
  constructor(
    @Inject(JwtPrincipalResolver) private readonly resolver: JwtPrincipalResolver,
    @Inject(JsonLogger) private readonly logger: JsonLogger,
  ) {}
  authenticate(principal: Principal): Promise<Principal> {
    return this.resolver.resolveSession(principal);
  }
  async run(userId: string, server: RealtimeServer): Promise<void> {
    for (const socket of server.sockets.sockets.values()) {
      const principal = socket.data.principal;
      if (principal?.userId !== userId) continue;
      try {
        const current = await this.authenticate(principal);
        socket.data.principal = current;
        if (socket.rooms.has("posts:all") && !current.permissions.has("posts:manage"))
          socket.disconnect(true);
      } catch (error) {
        if (error instanceof ApiError && error.init.code === "auth.token_invalid")
          socket.disconnect(true);
        else this.logger.warn("세션을 재검사하지 못해 연결을 유지한다");
      }
    }
  }
}
