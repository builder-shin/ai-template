import { AppState, Platform } from "react-native";
import { io, type Socket } from "socket.io-client";
import type { createApiClient } from "../api/client";
import type { RealtimeEventPayloads } from "../api/generated/realtime";
import type { components } from "../api/generated/schema";
import type { AppStatePort, Connection, SocketHandlers } from "./connection";
import { isEventName } from "./events";
type ServerEvents = {
  [Name in keyof RealtimeEventPayloads]: (payload: RealtimeEventPayloads[Name]) => void;
};
type Ack = components["schemas"]["RealtimeAck"];
interface ClientEvents {
  subscribe(
    payload: { channel: components["schemas"]["RealtimeChannel"] },
    answer: (ack: Ack) => void,
  ): void;
}
export function nativeAppState(): AppStatePort {
  const normalize = (value: unknown): "active" | "background" | "inactive" =>
    value === "active" ? "active" : value === "background" ? "background" : "inactive";
  let state = normalize(AppState.currentState),
    focused = true;
  const current = () => (state === "active" && !focused ? "inactive" : state);
  return {
    current,
    subscribe(listener) {
      const subscriptions = [
        AppState.addEventListener("change", (value) => {
          state = normalize(value);
          focused = true;
          listener(current());
        }),
      ];
      if (Platform.OS === "android")
        subscriptions.push(
          AppState.addEventListener("blur", () => {
            focused = false;
            listener(current());
          }),
          AppState.addEventListener("focus", () => {
            focused = true;
            listener(current());
          }),
        );
      return () => {
        for (const subscription of subscriptions) subscription.remove();
      };
    },
  };
}
export function ticketRequest(api: ReturnType<typeof createApiClient>) {
  return async (signal: AbortSignal) => {
    const { data } = await api.POST("/realtime-tickets", {
      body: { data: { type: "realtime-tickets", attributes: {} } },
      signal,
    });
    if (!data) throw new Error("Realtime ticket unavailable.");
    return data.data.attributes;
  };
}
export function nativeSocket(url: string) {
  const endpoint = new URL(url),
    path = `${endpoint.pathname.replace(/\/$/, "")}/socket.io`;
  return (ticket: string, handlers: SocketHandlers): Connection => {
    const socket: Socket<ServerEvents, ClientEvents> = io(endpoint.origin, {
      path,
      autoConnect: false,
      transports: ["websocket"],
      reconnection: false,
      timeout: 10000,
      forceNew: true,
      multiplex: false,
      withCredentials: false,
      auth: { ticket },
    });
    let closed = false;
    socket.on("connect", () => {
      socket
        .timeout(5000)
        .emit("subscribe", { channel: "posts" }, (error: Error | null | undefined, ack?: Ack) => {
          if (closed) return;
          if (!error && ack?.ok === true) handlers.connected();
          else handlers.failed();
        });
    });
    socket.on("connect_error", () => {
      if (!closed) handlers.failed();
    });
    socket.on("disconnect", () => {
      if (!closed) handlers.disconnected();
    });
    socket.onAny((name: string, ...payload: unknown[]) => {
      if (!closed && payload.length === 1 && isEventName(name)) handlers.event(name, payload[0]);
    });
    return {
      connect() {
        if (!closed) socket.connect();
      },
      close() {
        if (closed) return;
        closed = true;
        socket.offAny();
        socket.removeAllListeners();
        socket.disconnect();
      },
    };
  };
}
