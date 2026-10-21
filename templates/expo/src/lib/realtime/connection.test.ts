import { startRealtime, type AppStatePort, type SocketHandlers } from "./connection";
import { createQueryClient, sessionQueryKey } from "../query/client";
import { SessionManager, endSession } from "../session";
import { deferred, memoryStore, passwordGrant, tokens } from "../session/test-fixtures";

class State implements AppStatePort {
  value: "active" | "background" | "inactive" = "active";
  listeners = new Set<(value: string) => void>();
  current = () => this.value;
  subscribe = (listener: (value: string) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  emit(value: State["value"]) {
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }
}
const id = "98ddc2bf-531f-46c5-93e8-c234ae0c9e8c";
async function harness(automatic = true) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { gcTime: Infinity, retry: false } });
  const store = memoryStore(),
    appState = new State();
  let grants = 0;
  const session = new SessionManager({
    store,
    onBoundary: () => queryClient.clear(),
    transport: {
      grant: async () => tokens(++grants === 1 ? "first" : "second"),
      revoke: async () => {},
    },
  });
  await session.signIn(passwordGrant);
  const peers: { handlers: SocketHandlers; connect: jest.Mock; close: jest.Mock }[] = [];
  let ticketNumber = 0;
  const ticket = jest.fn(async (signal: AbortSignal) => {
    void signal;
    return {
      token: `ticket-${++ticketNumber}`,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
  });
  const socket = jest.fn((_ticket: string, handlers: SocketHandlers) => {
    const peer = {
      handlers,
      connect: jest.fn(() => {
        if (automatic) handlers.connected();
      }),
      close: jest.fn(() => handlers.disconnected()),
    };
    peers.push(peer);
    return peer;
  });
  const cancel = jest.fn(async () => {});
  const onRevoked = jest.fn(() => endSession({ manager: session, oauth: { cancel } }));
  const key = () => [...sessionQueryKey(session.generation(), "en"), "posts", "list"];
  return {
    queryClient,
    store,
    appState,
    session,
    peers,
    ticket,
    socket,
    cancel,
    onRevoked,
    key,
    start: () => startRealtime({ session, queryClient, appState, ticket, socket, onRevoked }),
  };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-21T00:00:00Z"));
});
afterEach(() => {
  jest.useRealTimers();
});
test("background owns no connection; foreground uses a new ticket and revalidates private queries", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  scope.queryClient.setQueryData(scope.key(), [{ id }]);
  scope.appState.emit("background");
  expect(scope.peers[0]!.close).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(60000);
  expect(scope.ticket).toHaveBeenCalledTimes(1);
  expect(scope.queryClient.getQueryData(scope.key())).toEqual([{ id }]);
  scope.appState.emit("active");
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.ticket).toHaveBeenCalledTimes(2);
  expect(scope.socket.mock.calls.map(([ticket]) => ticket)).toEqual(["ticket-1", "ticket-2"]);
  expect(scope.queryClient.getQueryState(scope.key())?.isInvalidated).toBe(true);
  stop();
  scope.queryClient.clear();
  expect(jest.getTimerCount()).toBe(0);
});
test("failed handshakes back off with fresh tickets and preserve the refresh record", async () => {
  const scope = await harness(false),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  const stored = scope.store.value;
  scope.peers[0]!.handlers.failed();
  await jest.advanceTimersByTimeAsync(499);
  expect(scope.ticket).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(scope.ticket).toHaveBeenCalledTimes(2);
  scope.peers[1]!.handlers.failed();
  await jest.advanceTimersByTimeAsync(999);
  expect(scope.ticket).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1);
  expect(scope.ticket).toHaveBeenCalledTimes(3);
  expect(scope.store.value).toEqual(stored);
  expect(scope.onRevoked).not.toHaveBeenCalled();
  stop();
  scope.queryClient.clear();
  expect(jest.getTimerCount()).toBe(0);
});
test("expired tickets are never connected and retries fetch a new one", async () => {
  const scope = await harness();
  scope.ticket.mockResolvedValueOnce({ token: "expired", expiresAt: "2020-01-01T00:00:00Z" });
  const stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.socket).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(500);
  expect(scope.socket).toHaveBeenCalledTimes(1);
  expect(scope.store.value).not.toBeNull();
  stop();
  scope.queryClient.clear();
});
test("revocation cancels pending OAuth, clears private data and ends the secure session", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  scope.queryClient.setQueryData(scope.key(), [{ id }]);
  scope.peers[0]!.handlers.event("session.revoked", { meta: { reason: "revoked" } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.cancel).toHaveBeenCalledTimes(1);
  expect(scope.store.value).toBeNull();
  expect(scope.session.snapshot().status).toBe("anonymous");
  expect(scope.queryClient.getQueryCache().getAll()).toHaveLength(0);
  stop();
  scope.queryClient.clear();
});
test("old connection/event callbacks cannot touch the next account", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  const old = scope.peers[0]!;
  await scope.session.signIn(passwordGrant);
  await jest.advanceTimersByTimeAsync(0);
  scope.queryClient.setQueryData(scope.key(), [{ id }]);
  old.handlers.connected();
  old.handlers.failed();
  old.handlers.event("session.revoked", { meta: { reason: "revoked" } });
  old.handlers.event("post.deleted", { data: { type: "posts", id } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.onRevoked).not.toHaveBeenCalled();
  expect(scope.queryClient.getQueryState(scope.key())?.isInvalidated).toBe(false);
  expect(scope.session.snapshot().sessionId).toBe("second");
  stop();
  scope.queryClient.clear();
});
test("duplicate post events invalidate without inserting duplicate data; unrelated queries stay fresh", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  scope.queryClient.setQueryData(scope.key(), [{ id }]);
  const sessions = [...sessionQueryKey(scope.session.generation(), "en"), "sessions"];
  scope.queryClient.setQueryData(sessions, []);
  for (let count = 0; count < 2; count++)
    scope.peers[0]!.handlers.event("post.created", { data: { type: "posts", id } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.queryClient.getQueryData(scope.key())).toEqual([{ id }]);
  expect(scope.queryClient.getQueryState(scope.key())?.isInvalidated).toBe(true);
  expect(scope.queryClient.getQueryState(sessions)?.isInvalidated).toBe(false);
  stop();
  scope.queryClient.clear();
});
test("visibility loss resets stale detail data rather than retaining it after a 404", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  const detail = [...sessionQueryKey(scope.session.generation(), "en"), "posts", "detail", id];
  scope.queryClient.setQueryData(detail, { data: { id, secret: "draft" } });
  scope.peers[0]!.handlers.event("post.unpublished", { data: { type: "posts", id } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.queryClient.getQueryData(detail)).toBeUndefined();
  stop();
  scope.queryClient.clear();
});
test("permission changes reset cached post lists, while profile-only changes preserve editable detail data", async () => {
  const scope = await harness(),
    stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  const detail = [...sessionQueryKey(scope.session.generation(), "en"), "posts", "detail", id];
  scope.queryClient.setQueryData(scope.key(), [{ id }]);
  scope.queryClient.setQueryData(detail, { data: { id, body: "editable" } });
  scope.peers[0]!.handlers.event("me.updated", { meta: { changed: ["profile"] } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.queryClient.getQueryData(detail)).toEqual({ data: { id, body: "editable" } });
  scope.peers[0]!.handlers.event("me.updated", { meta: { changed: ["roles"] } });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.queryClient.getQueryData(scope.key())).toBeUndefined();
  expect(scope.queryClient.getQueryData(detail)).toBeUndefined();
  stop();
  scope.queryClient.clear();
});
test("stop aborts pending ticket work and removes listeners before a late resolution", async () => {
  const scope = await harness(),
    pending = deferred<Awaited<ReturnType<typeof scope.ticket>>>();
  scope.ticket.mockImplementationOnce(() => pending.promise);
  const stop = scope.start();
  await jest.advanceTimersByTimeAsync(0);
  stop();
  expect(scope.ticket.mock.calls[0]![0].aborted).toBe(true);
  pending.resolve({ token: "late", expiresAt: new Date(Date.now() + 30000).toISOString() });
  await jest.advanceTimersByTimeAsync(0);
  scope.appState.emit("active");
  expect(scope.socket).not.toHaveBeenCalled();
  expect(scope.appState.listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  scope.queryClient.clear();
});
