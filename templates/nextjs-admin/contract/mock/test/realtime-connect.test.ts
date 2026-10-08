/**
 * 실시간 연결: 티켓으로 사용자 룸에 든다, 티켓은 한 번만 쓴다, 틀렸거나 끝난 티켓은 거부한다, 티켓이 없으면
 * 익명이다, 브라우저 Origin은 허용 목록으로 본다, WebSocket만 받는다, 닫으면 연결과 HTTP 서버를 함께
 * 닫는다. FastAPI 템플릿의 realtime/tests/test_gateway.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { SECOND } from "../src/core/clock.ts";
import { TICKET_TTL } from "../src/modules/realtime/tickets.ts";
import { newUser, send } from "./accounts.ts";
import { connect, refusal, serving, ticketFor } from "./sockets.ts";
import { testClock } from "./support.ts";

/** 거부한 연결의 connect_error.data(ErrorObject). */
const REFUSED = {
  status: "401",
  code: "auth.token_invalid",
  title: "Unauthorized",
  detail: "The realtime ticket is wrong or has expired.",
};

describe("티켓", () => {
  it("티켓으로 붙은 연결은 user:{id} 룸에 들고, 티켓은 한 번만 쓴다", async () => {
    const { app, state, url, realtime } = await serving();
    const user = await newUser(app, state);
    const ticket = await ticketFor(app, user);
    const socket = await connect(url, { auth: { ticket } });
    expect(socket.rooms(realtime)).toEqual(new Set([socket.socket.id, `user:${user.userId}`]));
    const again = await refusal(url, { auth: { ticket } });
    expect([again.message, again.data]).toEqual(["auth.token_invalid", REFUSED]);
  });

  it("끝난 세션의 티켓과 30초가 지난 티켓은 거부한다", async () => {
    const clock = testClock();
    const { app, state, url } = await serving({}, { clock });
    const [leaving, waiting] = [await newUser(app, state), await newUser(app, state)];
    const ended = await ticketFor(app, leaving);
    const logout = await send(app, "DELETE", "/api/v1/sessions/current", {
      token: leaving.accessToken,
    });
    expect(logout.status).toBe(204);
    expect((await refusal(url, { auth: { ticket: ended } })).data).toEqual(REFUSED);
    const [early, late] = [await ticketFor(app, waiting), await ticketFor(app, waiting)];
    clock.advance(TICKET_TTL - SECOND);
    await connect(url, { auth: { ticket: early } });
    clock.advance(SECOND);
    expect((await refusal(url, { auth: { ticket: late } })).data).toEqual(REFUSED);
  });

  it.each([
    ["서로게이트", "\ud800"],
    ["숫자", 123],
    ["빈 문자열", ""],
    ["객체", { token: "x" }],
    ["발급하지 않은 값", "x".repeat(43)],
  ])("%s 티켓은 거부한다", async (_, ticket) => {
    const { url } = await serving();
    const refused = await refusal(url, { auth: { ticket } });
    expect([refused.message, refused.data]).toEqual(["auth.token_invalid", REFUSED]);
  });

  it("티켓이 없거나 null이면 익명 연결이다", async () => {
    const { url, realtime } = await serving();
    for (const auth of [{}, { ticket: null }, { token: "티켓이 아니다" }]) {
      const socket = await connect(url, { auth });
      expect(socket.rooms(realtime)).toEqual(new Set([socket.socket.id]));
    }
  });
});

describe("전송", () => {
  it("허용 목록에 없는 Origin의 연결은 거부하고, 목록의 Origin과 Origin이 없는 연결은 받는다", async () => {
    const { url } = await serving({ realtimeAllowedOrigins: ["https://web.example.com"] });
    const outsider = await refusal(url, { origin: "http://localhost:3000" });
    expect(outsider.message).toBe("websocket error");
    await connect(url, { origin: "https://web.example.com" });
    await connect(url);
  });

  it("WebSocket만 받는다. 롱 폴링 요청은 400이다", async () => {
    const { url } = await serving();
    const response = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
    expect(response.status).toBe(400);
    await response.arrayBuffer();
  });

  it("API는 같은 포트에서 그대로 받는다", async () => {
    const { url } = await serving();
    const response = await fetch(`${url}/health/live`);
    expect(response.status).toBe(200);
    await response.arrayBuffer();
  });

  it("닫으면 연결을 끊고 HTTP 서버도 닫는다. 여러 번 닫아도 된다", async () => {
    const { url, realtime, state } = await serving();
    const socket = await connect(url);
    await Promise.all([realtime.close(), realtime.close()]);
    await realtime.close();
    expect(await socket.disconnected()).toBe("transport close");
    await expect(fetch(`${url}/health/live`)).rejects.toThrow();
    state.realtime.publish({ name: "me.updated", rooms: ["user:x"], payload: {} });
  });
});
