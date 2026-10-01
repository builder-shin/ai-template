/**
 * 실시간 서버. API와 같은 node:http 서버의 /socket.io(클라이언트의 기본 경로)에 Socket.IO를 붙인다
 * (FastAPI의 core/realtime.py의 create_realtime, ServerPublisher, Realtime.close와 modules/registry.py의
 * attach_realtime).
 *
 * - 전송은 WebSocket만 받는다. 롱 폴링 요청은 400이다.
 * - 브라우저 연결의 Origin은 허용 목록(REALTIME_ALLOWED_ORIGINS)으로 본다. 목록에 없으면 WebSocket
 *   핸드셰이크를 거부한다(클라이언트는 connect_error). Origin 헤더가 없는 연결(브라우저가 아닌
 *   클라이언트)은 받는다.
 * - 허브의 이벤트를 그 룸에 보낸다. 여러 룸에 든 연결도 한 번만 받는다. 보내다 실패해도 요청은
 *   성공한다(이벤트는 알림이다).
 * - 허브의 재검사 요청은 게이트웨이(gateway.ts)가 처리한다. 목은 프로세스가 하나라 제어 채널이 없다.
 */

import type { ServerType } from "@hono/node-server";
import { Server } from "socket.io";
import type { MockConfig } from "../../config.ts";
import type { RealtimeEvent } from "../../core/realtime.ts";
import type { MockState } from "../../state.ts";
import { attachGateway, type RealtimeSocketServer, recheck } from "./gateway.ts";

/** Socket.IO의 경로. 클라이언트의 기본값이고 FastAPI도 같다. */
export const SOCKET_PATH = "/socket.io";

export interface RealtimeServer {
  readonly io: RealtimeSocketServer;
  /**
   * 모든 연결을 끊고 HTTP 서버와 함께 닫는다. 허브의 이벤트는 더 받지 않는다. 여러 번 불러도 된다(같은
   * 결과를 돌려준다).
   */
  close(): Promise<void>;
}

/** 이벤트를 그 룸에 보낸다(FastAPI의 ServerPublisher). */
function deliver(io: RealtimeSocketServer, event: RealtimeEvent): void {
  // 빈 rooms를 그대로 넘기면 Socket.IO가 모든 연결에 보낸다.
  if (event.rooms.length === 0) return;
  try {
    io.to([...event.rooms]).emit(event.name, event.payload);
  } catch (error) {
    console.warn(`[mock] realtime_publish_failed realtime_event=${event.name}`, error);
  }
}

/** HTTP 서버(serve가 돌려준 서버)에 Socket.IO를 붙이고, 게이트웨이를 걸고, 허브의 이벤트와 재검사를 받는다. */
export function attachRealtime(
  server: ServerType,
  config: MockConfig,
  state: MockState,
): RealtimeServer {
  const origins = new Set(config.realtimeAllowedOrigins);
  const io: RealtimeSocketServer = new Server(server, {
    path: SOCKET_PATH,
    transports: ["websocket"],
    serveClient: false,
    allowRequest: (request, callback) => {
      const { origin } = request.headers;
      if (!origin || origins.has(origin)) callback(null, true);
      else callback(`${origin} is not an accepted origin.`, false);
    },
  });
  attachGateway(io, state);
  const stop = state.realtime.listen({
    event: (event) => {
      deliver(io, event);
    },
    recheck: (userIds) => {
      recheck(io, state, userIds);
    },
  });
  let closing: Promise<void> | undefined;
  return {
    io,
    close() {
      closing ??= new Promise((resolve, reject) => {
        stop();
        io.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        }).catch(reject);
      });
      return closing;
    },
  };
}
