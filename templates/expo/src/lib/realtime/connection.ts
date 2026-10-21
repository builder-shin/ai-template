import type { QueryClient } from "@tanstack/react-query";
import type { SessionManager } from "../session/manager";
import { invalidateEvent, revalidateForeground, validEvent, type EventName } from "./events";
export interface AppStatePort {
  current(): "active" | "background" | "inactive";
  subscribe(listener: (state: string) => void): () => void;
}
export interface SocketHandlers {
  connected(): void;
  failed(): void;
  disconnected(): void;
  event(name: EventName, payload: unknown): void;
}
export interface Connection {
  connect(): void;
  close(): void;
}
export interface Ticket {
  token: string;
  expiresAt: string;
}
export interface RealtimeInput {
  session: SessionManager;
  queryClient: QueryClient;
  appState: AppStatePort;
  ticket(signal: AbortSignal): Promise<Ticket>;
  socket(ticket: string, handlers: SocketHandlers): Connection;
  onRevoked(generation: number): Promise<void>;
}
export function startRealtime(input: RealtimeInput): () => void {
  let stopped = false,
    state: string = input.appState.current(),
    lease = 0,
    ownerGeneration = -1,
    failures = 0,
    revokedGeneration = -1;
  let socket: Connection | undefined,
    pending: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  function retire() {
    lease++;
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending?.abort();
    pending = undefined;
    const old = socket;
    socket = undefined;
    old?.close();
  }
  const owns = (epoch: number, generation: number) =>
    !stopped &&
    lease === epoch &&
    state === "active" &&
    input.session.generation() === generation &&
    input.session.snapshot().status === "authenticated" &&
    generation !== revokedGeneration;
  function retry(epoch: number, generation: number) {
    if (!owns(epoch, generation)) return;
    retire();
    const next = lease,
      delay = Math.min(30000, 500 * 2 ** Math.min(failures++, 6));
    timer = setTimeout(() => {
      if (lease !== next) return;
      timer = undefined;
      reconcile();
    }, delay);
  }
  async function attempt() {
    const generation = input.session.generation(),
      epoch = ++lease,
      controller = new AbortController();
    ownerGeneration = generation;
    pending = controller;
    try {
      const ticket = await input.ticket(controller.signal);
      if (!owns(epoch, generation)) return;
      if (
        !ticket ||
        typeof ticket.token !== "string" ||
        !ticket.token ||
        !Number.isFinite(Date.parse(ticket.expiresAt)) ||
        Date.parse(ticket.expiresAt) <= Date.now()
      )
        throw new Error("Realtime ticket unavailable.");
      pending = undefined;
      socket = input.socket(ticket.token, {
        connected: () => {
          if (owns(epoch, generation)) {
            failures = 0;
            revalidateForeground(input.queryClient, generation);
          }
        },
        failed: () => retry(epoch, generation),
        disconnected: () => retry(epoch, generation),
        event: (name, payload) => {
          if (!owns(epoch, generation) || !validEvent(name, payload)) return;
          if (name === "session.revoked") {
            revokedGeneration = generation;
            retire();
            void input.queryClient.cancelQueries();
            input.queryClient.clear();
            // Start synchronously: endSession must fence this identity before another can sign in.
            try {
              void input.onRevoked(generation).catch(() => undefined);
            } catch {
              /* Memory/cache are already closed. */
            }
          } else invalidateEvent(input.queryClient, generation, name, payload);
        },
      });
      socket.connect();
    } catch {
      retry(epoch, generation);
    }
  }
  function reconcile() {
    const snapshot = input.session.snapshot();
    if (
      stopped ||
      state !== "active" ||
      snapshot.status !== "authenticated" ||
      snapshot.generation === revokedGeneration
    ) {
      retire();
      failures = 0;
      return;
    }
    if (ownerGeneration !== snapshot.generation) {
      retire();
      failures = 0;
    }
    if (!socket && !pending && !timer) void attempt();
  }
  const stopSession = input.session.subscribe(reconcile);
  const stopState = input.appState.subscribe((next) => {
    state = next;
    reconcile();
  });
  reconcile();
  return () => {
    if (stopped) return;
    stopped = true;
    stopSession();
    stopState();
    retire();
  };
}
