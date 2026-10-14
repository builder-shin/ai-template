import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server, ServerOptions } from "socket.io";
import type { RedisClients } from "../redis/clients.js";
import { normalizeOrigins, originAllowed } from "./origins.js";
export class RealtimeIoAdapter extends IoAdapter {
  private readonly origins: readonly string[];
  constructor(
    app: ConstructorParameters<typeof IoAdapter>[0],
    origins: readonly string[],
    private readonly redis?: RedisClients,
  ) {
    super(app);
    this.origins = normalizeOrigins(origins);
  }
  override createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const optionsForServer = {
      ...options,
      transports: ["websocket"],
      allowRequest: (request, done) => {
        done(null, originAllowed(request.headers.origin, this.origins));
      },
    } satisfies Partial<ServerOptions>;
    // IoAdapter 선언은 전체 옵션을 요구하지만 Socket.IO 생성자는 부분 옵션을 받는다.
    const server = super.createIOServer(port, optionsForServer as ServerOptions);
    if (this.redis)
      server.adapter(
        createAdapter(this.redis.adapterPublisher, this.redis.subscriber, {
          key: `${this.redis.prefix}:socket.io`,
        }),
      );
    return server;
  }
}
