/**
 * 실시간 티켓: 로그인해야 받는다, 30초 동안 한 번 쓴다, 원문 대신 digest만 둔다. FastAPI 템플릿의
 * realtime/tests/test_tickets.py와 같은 경우를 본다. 티켓으로 붙는 연결은 realtime-connect.test.ts가 본다.
 */

import { describe, expect, it } from "vitest";
import { SECOND } from "../src/core/clock.ts";
import { parseUuid } from "../src/core/ids.ts";
import { digest } from "../src/core/security.ts";
import type { components } from "../src/generated/api.ts";
import { consumeTicket, TICKET_TTL } from "../src/modules/realtime/tickets.ts";
import { newUser, send, type SignedIn } from "./accounts.ts";
import { codesOf, TIMESTAMP, testApp, testClock } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];
type RealtimeTicketResource = components["schemas"]["RealtimeTicketResource"];

const TICKETS = "/api/v1/realtime-tickets";
const TICKET = { data: { type: "realtime-tickets", attributes: {} } };

async function issue(app: App, user: SignedIn): Promise<RealtimeTicketResource> {
  const response = await send(app, "POST", TICKETS, { document: TICKET, token: user.accessToken });
  expect(response.status, await response.clone().text()).toBe(201);
  return ((await response.json()) as { data: RealtimeTicketResource }).data;
}

describe("POST /realtime-tickets", () => {
  it("로그인해야 받는다", async () => {
    const { app } = testApp();
    const response = await send(app, "POST", TICKETS, { document: TICKET });
    expect(await codesOf(response, 401)).toEqual(["auth.unauthenticated"]);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("본문은 realtime-tickets 생성 문서다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const document = { data: { type: "sessions", attributes: {} } };
    const response = await send(app, "POST", TICKETS, { document, token: user.accessToken });
    expect(await codesOf(response, 409)).toEqual(["resource.conflict"]);
  });

  it("30초 동안 쓰는 티켓을 주고, 원문 대신 digest로 사용자와 세션을 둔다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    const ticket = await issue(app, user);
    expect(ticket.type).toBe("realtime-tickets");
    expect(parseUuid(ticket.id)).toBe(ticket.id);
    const { token, expiresAt } = ticket.attributes;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt).toMatch(TIMESTAMP);
    const remaining = Date.parse(expiresAt) - clock.now() / 1000;
    expect(remaining).toBeGreaterThan(25_000);
    expect(remaining).toBeLessThanOrEqual(30_000);
    expect(state.realtimeTickets.take(token)).toBeUndefined();
    expect(state.realtimeTickets.take(digest(token))).toEqual({
      userId: user.userId,
      sessionId: user.sessionId,
    });
  });

  it("티켓은 한 번만 꺼내고, 30초가 지나면 없다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const user = await newUser(app, state);
    const [used, early, late] = [
      await issue(app, user),
      await issue(app, user),
      await issue(app, user),
    ];
    const login = { userId: user.userId, sessionId: user.sessionId };
    expect(consumeTicket(state, used.attributes.token)).toEqual(login);
    expect(consumeTicket(state, used.attributes.token)).toBeUndefined();
    clock.advance(TICKET_TTL - SECOND);
    expect(consumeTicket(state, early.attributes.token)).toEqual(login);
    clock.advance(SECOND);
    expect(consumeTicket(state, late.attributes.token)).toBeUndefined();
  });
});
