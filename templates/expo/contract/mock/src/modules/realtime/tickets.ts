/**
 * 실시간 티켓(FastAPI의 realtime/service.py). 브라우저는 access token을 모르므로 BFF가 티켓을 받아
 * 넘기고, 브라우저는 Socket.IO 연결의 auth.ticket에 넣는다(gateway.ts).
 *
 * - 티켓은 32바이트 불투명 토큰이다. 원문 대신 SHA-256(digest)을 키로 사용자와 세션을 30초 둔다
 *   (FastAPI는 Valkey에 SET ... EX로 둔다).
 * - 연결할 때 꺼내면서 지운다(GETDEL). 한 번만 쓸 수 있다.
 */

import type { Principal } from "../../core/access.ts";
import { type Instant, SECOND } from "../../core/clock.ts";
import { digest, newToken } from "../../core/security.ts";
import type { MockState } from "../../state.ts";

export const TICKET_TTL = 30 * SECOND;

/** 티켓이 가리키는 로그인(FastAPI의 Ticket, Valkey 키 realtime-ticket:<티켓의 digest>). */
export interface RealtimeTicket {
  readonly userId: string;
  readonly sessionId: string;
}

export interface IssuedTicket {
  /** 티켓 원문. 응답에만 담기고 저장하지 않는다. */
  readonly token: string;
  readonly expiresAt: Instant;
}

/** actor의 세션으로 티켓을 만든다. */
export function issueTicket(state: MockState, actor: Principal): IssuedTicket {
  const token = newToken();
  const ticket: RealtimeTicket = { userId: actor.userId, sessionId: actor.sessionId };
  state.realtimeTickets.set(digest(token), ticket, TICKET_TTL);
  return { token, expiresAt: state.clock.now() + TICKET_TTL };
}

/** 티켓을 꺼내면서 지운다. 없거나 만료됐으면 undefined다. */
export function consumeTicket(state: MockState, token: string): RealtimeTicket | undefined {
  return state.realtimeTickets.take(digest(token));
}
