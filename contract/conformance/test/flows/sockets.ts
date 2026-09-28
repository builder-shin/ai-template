/**
 * 실시간 흐름의 도우미. 대상의 Socket.IO에 WebSocket으로 붙는다(브라우저처럼 전송은 WebSocket만).
 * 받은 이벤트는 계약의 x-realtime-events 페이로드 스키마로, ack는 RealtimeAck로 검증한다.
 * 흐름 파일은 병렬로 돌므로, 공용 채널(posts)의 이벤트는 글 id 같은 조건으로 가려서 기다린다.
 */

import { io, type Socket } from "socket.io-client";
import { ContractViolation, validateEvent, validateSchema } from "../../src/validation.ts";
import { target } from "./support.ts";

const WAIT_MS = 5_000;

export interface Ack {
  readonly ok: boolean;
  readonly error?: { readonly status: string; readonly code: string };
}

interface Received {
  readonly event: string;
  readonly payload: unknown;
}

export interface ConnectOptions {
  readonly ticket?: string;
  /** 브라우저의 Origin. 없으면 보내지 않는다(브라우저가 아닌 클라이언트). */
  readonly origin?: string;
}

function open(options: ConnectOptions): Socket {
  return io(target.baseUrl, {
    transports: ["websocket"],
    auth: options.ticket === undefined ? {} : { ticket: options.ticket },
    reconnection: false,
    forceNew: true,
    timeout: WAIT_MS,
    ...(options.origin === undefined ? {} : { extraHeaders: { Origin: options.origin } }),
  });
}

/** 받은 이벤트를 모으는 연결. */
export class RealtimeClient {
  private readonly socket: Socket;
  private readonly received: Received[] = [];
  private readonly violations: string[] = [];

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.onAny((event: string, payload: unknown) => {
      this.violations.push(...validateEvent(event, payload));
      this.received.push({ event, payload });
    });
  }

  static async connect(options: ConnectOptions = {}): Promise<RealtimeClient> {
    const socket = open(options);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => {
        resolve();
      });
      socket.once("connect_error", (error) => {
        reject(error);
      });
    });
    return new RealtimeClient(socket);
  }

  /** 조건에 맞는 이벤트의 페이로드. 이미 받은 것도 본다. 제한 시간 안에 오지 않으면 던진다. */
  async next(event: string, match: (payload: unknown) => boolean = () => true): Promise<unknown> {
    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      if (this.violations.length > 0) throw new ContractViolation(this.violations);
      const found = this.received.find((item) => item.event === event && match(item.payload));
      if (found !== undefined) return found.payload;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${String(WAIT_MS)}ms 안에 ${event}를 받지 못했다.`);
  }

  /** ms 동안 조건에 맞는 이벤트가 오지 않았는가. */
  async nothing(event: string, match: (payload: unknown) => boolean, ms = 500): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return !this.received.some((item) => item.event === event && match(item.payload));
  }

  /** subscribe·unsubscribe를 보내고 ack를 받는다. ack는 계약의 RealtimeAck로 검증한다. */
  async ack(message: "subscribe" | "unsubscribe", payload: unknown): Promise<Ack> {
    const ack: unknown = await this.socket.timeout(WAIT_MS).emitWithAck(message, payload);
    const problems = validateSchema("RealtimeAck", ack);
    if (problems.length > 0) throw new ContractViolation(problems);
    return ack as Ack;
  }

  close(): void {
    this.socket.disconnect();
  }
}

/** 거부되는 연결의 connect_error. message는 에러 코드(또는 전송 오류), data는 ErrorObject다. */
export async function refused(
  options: ConnectOptions,
): Promise<{ readonly message: string; readonly data?: unknown }> {
  const socket = open(options);
  try {
    return await new Promise((resolve, reject) => {
      socket.once("connect", () => {
        reject(new Error("연결이 거부되지 않았다."));
      });
      socket.once("connect_error", (error: Error & { data?: unknown }) => {
        resolve({ message: error.message, data: error.data });
      });
    });
  } finally {
    socket.disconnect();
  }
}

/** 이벤트 페이로드의 data.id가 id인가. */
export function about(id: string | undefined): (payload: unknown) => boolean {
  return (payload) =>
    typeof payload === "object" &&
    payload !== null &&
    "data" in payload &&
    typeof payload.data === "object" &&
    payload.data !== null &&
    "id" in payload.data &&
    payload.data.id === id;
}
