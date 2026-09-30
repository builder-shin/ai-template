/**
 * Socket.IO 연결과 구독(FastAPI의 realtime/gateway.py). 실시간 서버(server.ts)가 만들 때 건다.
 *
 * - 연결: auth.ticket이 있으면 티켓을 꺼내 지우고(1회용) 그 연결을 user:{id} 룸에 넣는다. 티켓이
 *   틀렸거나 만료됐거나 세션이 끝났으면 연결을 거부한다. 클라이언트의 connect_error는 message가 에러
 *   코드(auth.token_invalid), data가 ErrorObject다. 티켓이 없으면(null도) 익명 연결이다.
 * - subscribe·unsubscribe: 페이로드는 RealtimeSubscription, ack는 RealtimeAck다. 모르는 채널이나 틀린
 *   페이로드는 validation.invalid_choice(422), 권한이 없으면 permission.denied(403)이고 source.pointer는
 *   /channel이다. 권한은 구독할 때 계산한다.
 * - 재검사(recheck): 세션을 폐기하거나 역할·상태를 바꾸면 허브가 알린다. 그 사용자의 연결을 다시 검사해
 *   세션이 끝났거나(폐기, 계정 비활성화·탈퇴) 구독한 채널의 권한을 잃은 연결을 끊는다. 끊긴 클라이언트는
 *   새 티켓으로 다시 붙는다(세션이 끝났으면 티켓 발급이 401이고, 권한을 잃은 채널은 구독이
 *   permission.denied다). 목은 프로세스가 하나라 제어 채널 없이 바로 검사한다.
 */

import type { DefaultEventsMap, ExtendedError, Server, Socket } from "socket.io";
import type { Principal } from "../../core/access.ts";
import type { PermissionCode } from "../../core/permissions.ts";
import { userRoom } from "../../core/realtime.ts";
import { isRecord } from "../../json.ts";
import { type ErrorCode, type ErrorObject, errorObject } from "../../jsonapi/errors.ts";
import type { MockState } from "../../state.ts";
import { sessionPrincipal } from "../auth/credentials.ts";
import { type Channel, CHANNELS } from "./channels.ts";
import { consumeTicket } from "./tickets.ts";

/** 로그인한 연결의 사용자와 세션(FastAPI가 소켓 세션에 두는 값). */
export interface SocketLogin {
  readonly userId: string;
  readonly sessionId: string;
}

/** 연결마다 두는 값(socket.data). 익명 연결에는 login이 없다. */
export interface SocketData {
  login?: SocketLogin;
}

/**
 * 클라이언트가 보내는 메시지(계약의 x-realtime-messages). 인자는 검증하기 전이라 unknown이다. ack를
 * 기다리는 메시지는 Socket.IO가 마지막 인자로 답할 함수를 준다.
 */
export interface ClientMessages {
  subscribe: (...args: unknown[]) => void;
  unsubscribe: (...args: unknown[]) => void;
}

/** 서버가 보내는 이벤트(계약의 x-realtime-events). 이름과 페이로드는 허브가 정한다. */
export type ServerEvents = Record<string, (payload: unknown) => void>;

export type RealtimeSocketServer = Server<
  ClientMessages,
  ServerEvents,
  DefaultEventsMap,
  SocketData
>;
type RealtimeSocket = Socket<ClientMessages, ServerEvents, DefaultEventsMap, SocketData>;

/** subscribe·unsubscribe의 ack(계약의 RealtimeAck). ok가 false면 error가 있다. */
export interface RealtimeAck {
  readonly ok: boolean;
  readonly error?: ErrorObject;
}

type Answer = (ack: RealtimeAck) => void;

const REFUSED = "The realtime ticket is wrong or has expired.";
const UNKNOWN_CHANNEL = "Unknown channel.";

/** 연결을 거부하는 에러. 클라이언트의 connect_error가 된다(FastAPI의 ConnectionRefusedError). */
function refused(): ExtendedError {
  const error = errorObject(401, "auth.token_invalid", REFUSED);
  return Object.assign(new Error(error.code), { data: error });
}

/** auth.ticket을 본다. 티켓이 없으면 익명 연결로 받고, 맞는 티켓이면 로그인한 연결로 받는다. */
function authenticate(state: MockState, socket: RealtimeSocket): ExtendedError | undefined {
  const auth: unknown = socket.handshake.auth;
  const ticket = isRecord(auth) ? auth.ticket : undefined;
  if (ticket === undefined || ticket === null) return undefined;
  const found = typeof ticket === "string" ? consumeTicket(state, ticket) : undefined;
  const principal =
    found === undefined ? undefined : sessionPrincipal(state.store, found.userId, found.sessionId);
  if (principal === undefined) return refused();
  socket.data.login = { userId: principal.userId, sessionId: principal.sessionId };
  return undefined;
}

/** 연결이 로그인한 세션의 Principal. 익명이거나 세션이 끝났으면 undefined다. */
function principalOf(state: MockState, socket: RealtimeSocket): Principal | undefined {
  const { login } = socket.data;
  if (login === undefined) return undefined;
  return sessionPrincipal(state.store, login.userId, login.sessionId);
}

function failed(status: 403 | 422, code: ErrorCode, detail: string): RealtimeAck {
  return { ok: false, error: errorObject(status, code, detail, { pointer: "/channel" }) };
}

/** 페이로드(RealtimeSubscription)의 채널. 페이로드가 틀렸거나 모르는 채널이면 undefined다. */
function channelOf(payload: unknown): Channel | undefined {
  const name = isRecord(payload) ? payload.channel : undefined;
  return typeof name === "string" ? CHANNELS.get(name) : undefined;
}

/** 연결의 세션이 살아 있고 이 권한을 가졌는가. 권한은 부를 때 역할로 계산한다. */
function holds(state: MockState, socket: RealtimeSocket, permission: PermissionCode): boolean {
  return principalOf(state, socket)?.permissions.has(permission) === true;
}

function subscribe(state: MockState, socket: RealtimeSocket, payload: unknown): RealtimeAck {
  const channel = channelOf(payload);
  if (channel === undefined) return failed(422, "validation.invalid_choice", UNKNOWN_CHANNEL);
  const { name, permission } = channel;
  if (permission !== undefined && !holds(state, socket, permission)) {
    return failed(403, "permission.denied", `Subscribing to ${name} needs ${permission}.`);
  }
  void socket.join(name);
  return { ok: true };
}

function unsubscribe(socket: RealtimeSocket, payload: unknown): RealtimeAck {
  const channel = channelOf(payload);
  if (channel === undefined) return failed(422, "validation.invalid_choice", UNKNOWN_CHANNEL);
  void socket.leave(channel.name);
  return { ok: true };
}

function isAnswer(value: unknown): value is Answer {
  return typeof value === "function";
}

/**
 * 메시지 하나를 처리하고, 클라이언트가 ack를 기다리면 답한다. 페이로드가 없으면 undefined로 처리한다
 * (FastAPI의 data=None). FastAPI의 처리기는 페이로드를 하나만 받아 둘 이상이면 실패하므로(TypeError), 목도
 * 처리하지도 답하지도 않고 경고만 남긴다.
 */
function handleMessage(
  message: keyof ClientMessages,
  args: readonly unknown[],
  work: (payload: unknown) => RealtimeAck,
): void {
  const last = args.at(-1);
  const answer = isAnswer(last) ? last : undefined;
  const payloads = answer === undefined ? args : args.slice(0, -1);
  if (payloads.length > 1) {
    const count = String(payloads.length);
    console.warn(`[mock] realtime_message_ignored message=${message} payloads=${count}`);
    return;
  }
  const ack = work(payloads[0]);
  answer?.(ack);
}

/** 서버에 연결 인증과 구독 처리를 건다(FastAPI의 attach). 재검사는 서버가 허브에서 받아 넘긴다. */
export function attachGateway(io: RealtimeSocketServer, state: MockState): void {
  io.use((socket, next) => {
    next(authenticate(state, socket));
  });
  io.on("connection", (socket) => {
    const { login } = socket.data;
    if (login !== undefined) void socket.join(userRoom(login.userId));
    socket.on("subscribe", (...args) => {
      handleMessage("subscribe", args, (payload) => subscribe(state, socket, payload));
    });
    socket.on("unsubscribe", (...args) => {
      handleMessage("unsubscribe", args, (payload) => unsubscribe(socket, payload));
    });
  });
}

/** 연결의 세션이 살아 있고, 구독한 채널의 권한을 모두 가졌는가(FastAPI의 _still_allowed). */
function stillAllowed(state: MockState, socket: RealtimeSocket): boolean {
  const principal = principalOf(state, socket);
  if (principal === undefined) return false;
  return [...socket.rooms].every((room) => {
    const permission = CHANNELS.get(room)?.permission;
    return permission === undefined || principal.permissions.has(permission);
  });
}

/**
 * 이 사용자들의 연결을 다시 검사해 자격을 잃은 연결을 끊는다(FastAPI의 Gateway.recheck). 서버 쪽에서
 * 끊으므로 클라이언트는 io server disconnect를 받는다. 이미 끊긴 연결은 건너뛰고, 연결 하나를 검사하다
 * 실패해도 남은 연결과 남은 사용자는 계속 검사한다.
 */
export function recheck(
  io: RealtimeSocketServer,
  state: MockState,
  userIds: readonly string[],
): void {
  const { adapter, sockets } = io.sockets;
  for (const userId of userIds) {
    for (const id of [...(adapter.rooms.get(userRoom(userId)) ?? [])]) {
      try {
        const socket = sockets.get(id);
        if (socket !== undefined && !stillAllowed(state, socket)) socket.disconnect();
      } catch (error) {
        console.warn(`[mock] realtime_recheck_connection_failed sid=${id}`, error);
      }
    }
  }
}
