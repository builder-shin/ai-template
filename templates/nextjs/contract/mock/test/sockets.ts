/**
 * 실시간 테스트의 도우미(FastAPI 테스트의 app/tests/sockets.py). 앱을 임시 포트에 띄워 main.ts처럼
 * 실시간(attachRealtime)을 붙이고, 실제 socket.io-client로 붙는다. 전송은 브라우저처럼 WebSocket만 쓴다.
 * 서버와 연결은 테스트가 끝나면 닫는다.
 */

import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { io, type Socket } from "socket.io-client";
import { expect, onTestFinished, vi } from "vitest";
import type { MockConfig } from "../src/config.ts";
import { attachRealtime, type RealtimeServer } from "../src/modules/realtime/server.ts";
import type { StateOptions } from "../src/state.ts";
import { send, type SignedIn } from "./accounts.ts";
import { testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

const TICKET = { data: { type: "realtime-tickets", attributes: {} } };
const ACK_TIMEOUT_MS = 1_000;

export interface Serving extends ReturnType<typeof testApp> {
  readonly realtime: RealtimeServer;
  /** 서버 주소. 예: http://127.0.0.1:53123 */
  readonly url: string;
}

/** 앱을 임시 포트에 띄우고 실시간을 붙인다. */
export async function serving(
  overrides: Partial<MockConfig> = {},
  options: StateOptions = {},
): Promise<Serving> {
  const served = testApp(overrides, options);
  const server = serve({ fetch: served.app.fetch, port: 0, hostname: "127.0.0.1" });
  const realtime = attachRealtime(server, served.config, served.state);
  onTestFinished(() => realtime.close());
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { ...served, realtime, url: `http://127.0.0.1:${String(port)}` };
}

/** 이 테스트 동안 console.warn을 출력하지 않고 모은다. */
export function capturedWarnings() {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  onTestFinished(() => {
    warn.mockRestore();
  });
  return warn;
}

/** 로그인한 사용자의 실시간 티켓. */
export async function ticketFor(app: App, user: SignedIn): Promise<string> {
  const response = await send(app, "POST", "/api/v1/realtime-tickets", {
    document: TICKET,
    token: user.accessToken,
  });
  expect(response.status, await response.clone().text()).toBe(201);
  const body = (await response.json()) as { data: { attributes: { token: string } } };
  return body.data.attributes.token;
}

export interface ConnectOptions {
  /** 연결의 auth. 없으면 빈 객체(익명)다. */
  readonly auth?: Readonly<Record<string, unknown>>;
  /** 브라우저의 Origin. 없으면 보내지 않는다(브라우저가 아닌 클라이언트). */
  readonly origin?: string;
}

/** 받은 이벤트와 끊김을 받은 차례대로 모으는 연결. */
export class TestSocket {
  readonly socket: Socket;
  /** 받은 것. 이벤트는 [이름, 페이로드], 끊기면 ["disconnect", 까닭]이다. */
  readonly log: [string, unknown][] = [];

  constructor(url: string, options: ConnectOptions) {
    this.socket = io(url, {
      transports: ["websocket"],
      auth: { ...options.auth },
      reconnection: false,
      forceNew: true,
      ...(options.origin === undefined ? {} : { extraHeaders: { Origin: options.origin } }),
    });
    onTestFinished(() => {
      this.socket.disconnect();
    });
    this.socket.onAny((event: string, payload: unknown) => {
      this.log.push([event, payload]);
    });
    this.socket.on("disconnect", (reason) => {
      this.log.push(["disconnect", reason]);
    });
  }

  /** 메시지를 보내고 ack를 받는다. */
  call(message: string, ...args: unknown[]): Promise<unknown> {
    return this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(message, ...args);
  }

  /**
   * 서버가 이 연결에 앞서 보낸 것을 모두 받을 때까지 기다린다. 같은 연결의 패킷은 차례대로 오므로, 빈
   * unsubscribe의 ack가 오면 그 전에 보낸 이벤트는 이미 받았다.
   */
  async settle(): Promise<void> {
    await this.call("unsubscribe", {});
  }

  /** 연결이 끊길 때까지 기다려 까닭을 돌려준다. 서버가 끊었으면 io server disconnect다. */
  disconnected(): Promise<unknown> {
    return vi.waitFor(() => {
      const found = this.log.find(([event]) => event === "disconnect");
      if (found === undefined) throw new Error("아직 끊기지 않았다.");
      return found[1];
    });
  }

  /** 서버에서 본 이 연결이 든 룸. 끊겼으면 undefined다. */
  rooms(realtime: RealtimeServer): ReadonlySet<string> | undefined {
    return realtime.io.sockets.sockets.get(this.socket.id ?? "")?.rooms;
  }
}

/** 붙는다. 거부되면 connect_error의 에러를 던진다. */
export async function connect(url: string, options: ConnectOptions = {}): Promise<TestSocket> {
  const client = new TestSocket(url, options);
  await new Promise<void>((resolve, reject) => {
    client.socket.once("connect", resolve);
    client.socket.once("connect_error", reject);
  });
  return client;
}

/** 거부되는 연결의 connect_error. message는 에러 코드(또는 전송 오류), data는 ErrorObject다. */
export function refusal(
  url: string,
  options: ConnectOptions = {},
): Promise<Error & { data?: unknown }> {
  const client = new TestSocket(url, options);
  return new Promise((resolve, reject) => {
    client.socket.once("connect", () => {
      reject(new Error("연결이 거부되지 않았다."));
    });
    client.socket.once("connect_error", resolve);
  });
}
