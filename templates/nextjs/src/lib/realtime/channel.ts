import type { Socket } from "socket.io-client";
import type { components } from "../api/schema";
import { realtimeEventNames, type RealtimeEventPayloads } from "../generated/realtime";

type PostEventName = Extract<keyof RealtimeEventPayloads, `post.${string}`>;
export type PostEvent = {
  [Name in PostEventName]: { name: Name; payload: RealtimeEventPayloads[Name] };
}[PostEventName];
type ServerEvents = {
  [Name in keyof RealtimeEventPayloads]: (payload: RealtimeEventPayloads[Name]) => void;
};
type Ack = components["schemas"]["RealtimeAck"];
type Channel = components["schemas"]["RealtimeChannel"];
interface ClientEvents {
  subscribe: (payload: { channel: Channel }, answer: (ack: Ack) => void) => void;
  unsubscribe: (payload: { channel: Channel }) => void;
}
export type RealtimeSocket = Socket<ServerEvents, ClientEvents>;

/** Socket.IO의 변경 가능한 전송 설정을 React 상태·props와 분리한다. */
export function setSocketAuthentication(socket: RealtimeSocket, auth: RealtimeSocket["auth"]) {
  socket.auth = auth;
}
type Handler = (event: PostEvent) => void;
interface Subscription {
  handlers: Set<Handler>;
  stop: () => void;
}
const subscriptions = new WeakMap<RealtimeSocket, Map<Channel, Subscription>>();

/** 같은 채널의 소비자를 묶는다. 마지막 소비자만 서버 구독과 처리기를 해제한다. */
export function subscribeChannel(socket: RealtimeSocket, channel: Channel, handler: Handler) {
  const channels = subscriptions.get(socket) ?? new Map<Channel, Subscription>();
  subscriptions.set(socket, channels);
  let subscription = channels.get(channel);
  if (!subscription) {
    const handlers = new Set<Handler>();
    const subscribe = () =>
      socket.emit("subscribe", { channel }, (ack) => {
        if (!ack.ok && channels.has(channel))
          console.warn("실시간 채널 구독 거부", { channel, code: ack.error?.code });
      });
    const stops: (() => void)[] = [];
    function listen(name: PostEventName) {
      const receive = (payload: RealtimeEventPayloads[PostEventName]) => {
        for (const listener of handlers) listener({ name, payload } as PostEvent);
      };
      socket.on(name, receive);
      stops.push(() => socket.off(name, receive));
    }
    for (const name of realtimeEventNames)
      if (name.startsWith("post.")) listen(name as PostEventName);
    socket.on("connect", subscribe);
    subscription = {
      handlers,
      stop() {
        socket.off("connect", subscribe);
        for (const stop of stops) stop();
        if (socket.connected) socket.emit("unsubscribe", { channel });
      },
    };
    channels.set(channel, subscription);
    if (socket.connected) subscribe();
  }
  subscription.handlers.add(handler);
  return () => {
    subscription.handlers.delete(handler);
    if (subscription.handlers.size) return;
    subscription.stop();
    channels.delete(channel);
  };
}
