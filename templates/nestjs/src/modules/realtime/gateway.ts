import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Inject, type OnModuleInit } from "@nestjs/common";
import { TicketStore } from "../../core/realtime/tickets.js";
import { RuntimeRealtimePublisher } from "../../core/realtime/publisher.js";
import { ControlChannel } from "../../core/realtime/control-channel.js";
import { SessionRecheck, type RealtimeServer, type RealtimeSocket } from "./recheck.js";
import { realtimeSubscriptionSchema, type RealtimeAck } from "./schemas.js";
import { tokenError } from "../../core/security/jwt.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { realtimeDeclarations } from "../../core/realtime/declarations.js";
@WebSocketGateway({ path: "/socket.io" })
export class RealtimeGateway implements OnModuleInit {
  @WebSocketServer() server?: RealtimeServer;
  constructor(
    @Inject(TicketStore) private readonly tickets: TicketStore,
    @Inject(RuntimeRealtimePublisher) private readonly publisher: RuntimeRealtimePublisher,
    @Inject(ControlChannel) private readonly control: ControlChannel,
    @Inject(SessionRecheck) private readonly recheck: SessionRecheck,
  ) {}
  afterInit(server: RealtimeServer): void {
    this.server = server;
    this.publisher.bind(server);
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => {
          next();
        },
        (error: unknown) => {
          const init =
            error instanceof ApiError
              ? error.init
              : {
                  status: 503,
                  code: "service.unavailable",
                  title: "실시간 인증을 확인하지 못했다",
                };
          next(
            Object.assign(new Error(init.code), {
              data: { status: String(init.status), code: init.code, title: init.title },
            }),
          );
        },
      );
    });
  }
  async onModuleInit(): Promise<void> {
    if (this.server)
      await this.control.subscribe((userId) =>
        this.recheck.run(userId, this.server as RealtimeServer),
      );
  }
  private async authenticate(socket: RealtimeSocket): Promise<void> {
    const auth = socket.handshake.auth as Record<string, unknown>;
    if (!Object.hasOwn(auth, "ticket")) return;
    if (typeof auth.ticket !== "string") throw tokenError();
    const principal = await this.tickets.consume(auth.ticket);
    if (!principal) throw tokenError();
    socket.data.principal = await this.recheck.authenticate(principal);
    await socket.join("user:" + principal.userId);
  }
  @SubscribeMessage("subscribe")
  subscribe(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<RealtimeAck> {
    return this.subscription(socket, payload, true);
  }
  @SubscribeMessage("unsubscribe")
  unsubscribe(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() payload: unknown,
  ): Promise<RealtimeAck> {
    return this.subscription(socket, payload, false);
  }
  private async subscription(
    socket: RealtimeSocket,
    payload: unknown,
    join: boolean,
  ): Promise<RealtimeAck> {
    const parsed = realtimeSubscriptionSchema.safeParse(payload);
    if (!parsed.success)
      return {
        ok: false,
        error: {
          status: "422",
          code: "validation.invalid_choice",
          title: "실시간 채널 요청이 잘못됐다",
          source: { pointer: "/channel" },
        },
      };
    const channel = realtimeDeclarations().channels.find((c) => c.name === parsed.data.channel);
    if (!channel)
      return {
        ok: false,
        error: {
          status: "422",
          code: "validation.invalid_choice",
          title: "실시간 채널이 없다",
          source: { pointer: "/channel" },
        },
      };
    if (join && channel.permission && !socket.data.principal?.permissions.has(channel.permission))
      return {
        ok: false,
        error: { status: "403", code: "permission.denied", title: "실시간 채널 권한이 없다" },
      };
    try {
      if (join) await socket.join(channel.name);
      else await socket.leave(channel.name);
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: { status: "500", code: "internal.unexpected", title: "실시간 채널 요청에 실패했다" },
      };
    }
  }
}
