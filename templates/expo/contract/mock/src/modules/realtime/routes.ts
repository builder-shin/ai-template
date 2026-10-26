/**
 * realtime의 API: 실시간 티켓(RealtimeTickets, FastAPI의 realtime/router.py). BFF가 로그인한 사용자의
 * 티켓을 받아 브라우저에 넘긴다. 브라우저는 access token을 모른다.
 */

import { formatInstant } from "../../core/clock.ts";
import { uuid7 } from "../../core/ids.ts";
import type { components } from "../../generated/api.ts";
import { render } from "../../jsonapi/rendering.ts";
import type { JsonApiRouter } from "../../jsonapi/router.ts";
import type { MockState } from "../../state.ts";
import { issueTicket } from "./tickets.ts";

type RealtimeTicketDocument = components["schemas"]["RealtimeTicketDocument"];

export function realtimeRoutes(api: JsonApiRouter, state: MockState): void {
  api.route("RealtimeTickets_create", { auth: "required" }, ({ principal }) => {
    const ticket = issueTicket(state, principal);
    const body: RealtimeTicketDocument = {
      data: {
        type: "realtime-tickets",
        id: uuid7(),
        attributes: { token: ticket.token, expiresAt: formatInstant(ticket.expiresAt) },
      },
    };
    return render(body, { status: 201 });
  });
}
