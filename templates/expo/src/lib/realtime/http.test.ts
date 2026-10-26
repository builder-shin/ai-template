/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { QueryObserver } from "@tanstack/react-query";
import { startRealtime, type AppStatePort, type SocketHandlers, type Ticket } from "./connection";
import { nativeSocket, ticketRequest } from "./native";
import { createHttpScope, installNodeHttp, startMock } from "../testing/native-http";
import { endSession } from "../session";
import { sessionQueryKey } from "../query/client";
import { deferred } from "../session/test-fixtures";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock(
  "socket.io-client",
  () =>
    (globalThis as typeof globalThis & { __nodeSocketIO: typeof import("socket.io-client") })
      .__nodeSocketIO,
);
installNodeHttp();
class State implements AppStatePort {
  value: "active" | "background" | "inactive" = "active";
  listeners = new Set<(state: string) => void>();
  current = () => this.value;
  subscribe = (listener: (state: string) => void) => {
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
let server: Awaited<ReturnType<typeof startMock>>;
const scopes: ReturnType<typeof createHttpScope>[] = [],
  stops: (() => void)[] = [];
beforeAll(async () => {
  server = await startMock();
}, 20000);
afterEach(async () => {
  for (const stop of stops.splice(0).reverse()) stop();
  for (const scope of scopes.splice(0)) await scope.dispose();
  jest.restoreAllMocks();
});
afterAll(async () => {
  await server?.stop();
});
async function until(check: () => boolean) {
  const deadline = Date.now() + 4000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Owned realtime condition timed out.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function scope() {
  const result = createHttpScope(server.base);
  scopes.push(result);
  await result.value.manager.restore();
  await result.value.manager.signIn({
    grantType: "password",
    email: "admin@example.com",
    password: "admin-password", // betterleaks:allow
  }); // betterleaks:allow mock seed
  return result;
}
async function observePosts(current: Awaited<ReturnType<typeof scope>>) {
  const { data: me } = await current.value.api.GET("/me");
  const key = [...sessionQueryKey(current.value.manager.generation(), "en"), "posts", "list"];
  const observer = new QueryObserver(current.queryClient, {
    queryKey: key,
    queryFn: async () => {
      const { data } = await current.value.api.GET("/posts", {
        params: { query: { "filter[author]": me!.data.id } },
      });
      if (!data) throw new Error("Missing posts.");
      return data;
    },
  });
  stops.push(observer.subscribe(() => {}));
  await observer.refetch();
  return observer;
}
function connect(
  current: Awaited<ReturnType<typeof scope>>,
  ticketPort = ticketRequest(current.value.api),
) {
  const appState = new State(),
    ready = deferred<void>();
  let connections = 0;
  const ticket = jest.fn(ticketPort),
    factory = nativeSocket(server.base);
  const socket = (token: string, handlers: SocketHandlers) =>
    factory(token, {
      ...handlers,
      connected() {
        connections++;
        handlers.connected();
        ready.resolve();
      },
    });
  stops.push(
    startRealtime({
      session: current.value.manager,
      queryClient: current.queryClient,
      appState,
      ticket,
      socket,
      onRevoked: async (generation) => {
        if (current.value.manager.generation() === generation) await endSession(current.value);
      },
    }),
  );
  return { appState, ticket, ready: ready.promise, connections: () => connections };
}
test("real mock Socket.IO refreshes a live own-post query from authoritative HTTP", async () => {
  const current = await scope(),
    observer = await observePosts(current),
    live = connect(current);
  await live.ready;
  const { data: post } = await current.value.api.POST("/posts", {
    body: {
      data: { type: "posts", attributes: { title: "Realtime native", body: "", status: "draft" } },
    },
  });
  await until(
    () => observer.getCurrentResult().data?.data.some((item) => item.id === post!.data.id) === true,
  );
  expect(
    observer.getCurrentResult().data!.data.filter((item) => item.id === post!.data.id),
  ).toHaveLength(1);
  await current.value.api.DELETE("/posts/{id}", { params: { path: { id: post!.data.id } } });
});
test("background misses events; foreground obtains a fresh ticket and revalidates the list", async () => {
  const current = await scope(),
    observer = await observePosts(current),
    live = connect(current);
  await live.ready;
  live.appState.emit("background");
  const { data: post } = await current.value.api.POST("/posts", {
    body: {
      data: {
        type: "posts",
        attributes: { title: "While backgrounded", body: "", status: "draft" },
      },
    },
  });
  expect(observer.getCurrentResult().data!.data.some((item) => item.id === post!.data.id)).toBe(
    false,
  );
  live.appState.emit("active");
  await until(
    () =>
      live.connections() === 2 &&
      observer.getCurrentResult().data?.data.some((item) => item.id === post!.data.id) === true,
  );
  expect(live.ticket).toHaveBeenCalledTimes(2);
  await current.value.api.DELETE("/posts/{id}", { params: { path: { id: post!.data.id } } });
});
test("a consumed ticket is rejected by the actual server and replaced without dropping the refresh record", async () => {
  const current = await scope(),
    request = ticketRequest(current.value.api),
    used = await request(new AbortController().signal),
    ready = deferred<void>();
  const probe = nativeSocket(server.base)(used.token, {
    connected: () => ready.resolve(),
    failed: () => ready.reject(new Error("Probe handshake failed.")),
    disconnected: () => {},
    event: () => {},
  });
  stops.push(() => probe.close());
  probe.connect();
  await ready.promise;
  probe.close();
  let first = true;
  const stored = current.store.value;
  const live = connect(current, async (signal): Promise<Ticket> => {
    if (first) {
      first = false;
      return used;
    }
    return request(signal);
  });
  await live.ready;
  expect(live.ticket).toHaveBeenCalledTimes(2);
  expect(current.store.value).toEqual(stored);
});
test.each([false, true])(
  "server revocation clears pending OAuth and secure state even when missed in background=%s",
  async (background) => {
    const current = await scope(),
      actor = await scope(),
      cancel = jest.spyOn(current.value.oauth, "cancel");
    const live = connect(current);
    await live.ready;
    if (background) live.appState.emit("background");
    current.queryClient.setQueryData(
      [...sessionQueryKey(current.value.manager.generation(), "en"), "private"],
      ["private"],
    );
    await actor.value.api.DELETE("/sessions/{id}", {
      params: { path: { id: current.value.manager.snapshot().sessionId! } },
    });
    if (background) live.appState.emit("active");
    await until(
      () => current.value.manager.snapshot().status === "anonymous" && current.store.value === null,
    );
    expect(current.store.value).toBeNull();
    expect(cancel).toHaveBeenCalled();
    expect(current.queryClient.getQueryCache().getAll()).toHaveLength(0);
  },
);
