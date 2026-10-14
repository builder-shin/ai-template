import { Controller, Inject } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { TicketStore } from "../../core/realtime/tickets.js";
import { createRealtimeTicket } from "./operations.js";
@Controller()
export class RealtimeController {
  constructor(@Inject(TicketStore) private readonly tickets: TicketStore) {}
  @Operation(createRealtimeTicket)
  async create(@JsonApiRequest() input: ValidatedRequest<typeof createRealtimeTicket>) {
    const at = Date.now();
    const token = await this.tickets.issue(input.principal as Principal);
    return {
      data: {
        type: "realtime-tickets",
        id: randomUUID(),
        attributes: { token, expiresAt: new Date(at + 30000).toISOString() },
      },
    };
  }
}
