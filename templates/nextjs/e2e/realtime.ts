import type { Page, WebSocket } from "@playwright/test";

/** 앱 연결의 실제 ack·이벤트만 관찰한다. 티켓과 이벤트 본문은 저장하거나 출력하지 않는다. */
export function observeRealtime(page: Page) {
  const connected = new Set<WebSocket>();
  const subscribed = new Set<WebSocket>();
  const received = new Set<string>();
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    let postsAck: string | undefined;
    socket.on("framesent", ({ payload }) => {
      const match = String(payload).match(/^42(\d+)(\[.*)$/);
      if (!match) return;
      const [event, data] = JSON.parse(match[2]!) as [string, { channel?: string }];
      if (event === "subscribe" && data.channel === "posts") postsAck = match[1];
    });
    socket.on("framereceived", ({ payload }) => {
      const frame = String(payload);
      if (frame.startsWith("40")) connected.add(socket);
      if (postsAck && frame.startsWith(`43${postsAck}[`)) {
        const [ack] = JSON.parse(frame.slice(2 + postsAck.length)) as { ok: boolean }[];
        if (ack?.ok) subscribed.add(socket);
      }
      const event = frame.match(/^42\d*(\[.*)$/);
      if (event) {
        const [name] = JSON.parse(event[1]!) as [string];
        received.add(name);
      }
    });
    socket.on("close", () => {
      connected.delete(socket);
      subscribed.delete(socket);
    });
  });
  return {
    get connected() {
      return connected.size > 0;
    },
    get postsSubscribed() {
      return subscribed.size > 0;
    },
    received,
  };
}
