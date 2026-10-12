import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { INestApplicationContext } from "@nestjs/common";
import type { Server, ServerOptions } from "socket.io";
import type { RedisClients } from "../redis/clients.js";
import { allowedOrigins } from "./origins.js";
import type { Settings } from "../config/settings.js";
export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redis: RedisClients,
    private readonly settings: Settings,
  ) {
    super(app);
  }
  override createIOServer(port: number, options: ServerOptions): Server {
    const origins = allowedOrigins(this.settings.REALTIME_ALLOWED_ORIGINS);
    const server = super.createIOServer(port, {
      ...options,
      transports: ["websocket"],
      allowRequest: (request, done) => {
        done(null, request.headers.origin === undefined || origins.has(request.headers.origin));
      },
    });
    server.adapter(
      createAdapter(this.redis.adapterPublisher, this.redis.adapterSubscriber, {
        key: `${this.redis.prefix}:socket.io`,
      }),
    );
    return server;
  }
}
