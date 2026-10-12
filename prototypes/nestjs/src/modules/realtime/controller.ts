import { ApiError } from "../../core/jsonapi/errors.js";
import { Controller } from "@nestjs/common";
import { SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { OnGatewayInit } from "@nestjs/websockets";
import type { Server } from "socket.io";
import type { RealtimeSocket } from "../../core/realtime/gateway-base.js";
import { JsonApiRoute, JsonApiRequest, JsonApiPrincipal } from "../../core/jsonapi/decorators.js";
import type { Principal } from "../auth/index.js";
import { RealtimeTickets_create } from "./operations.js";
import { RealtimeService } from "./service.js";
@Controller()
export class RealtimeController {
  constructor(private readonly service: RealtimeService) {}
  @JsonApiRoute(RealtimeTickets_create)
  ticket(@JsonApiRequest() _parsed: unknown, @JsonApiPrincipal() principal: Principal) {
    return this.service.ticket(principal);
  }
}
@WebSocketGateway({ path: "/socket.io", transports: ["websocket"] })
export class RealtimeGateway implements OnGatewayInit {
  constructor(private readonly service: RealtimeService) {}
  afterInit(server: Server): void {
    this.service.attach(server);
  }
  @SubscribeMessage("subscribe")
  subscribe(socket: RealtimeSocket, payload: unknown) {
    return this.service
      .subscription(socket, payload, true)
      .catch(() => ({ ok: false, error: new ApiError(503, "service.unavailable").toObject() }));
  }
  @SubscribeMessage("unsubscribe")
  unsubscribe(socket: RealtimeSocket, payload: unknown) {
    return this.service
      .subscription(socket, payload, false)
      .catch(() => ({ ok: false, error: new ApiError(503, "service.unavailable").toObject() }));
  }
}
