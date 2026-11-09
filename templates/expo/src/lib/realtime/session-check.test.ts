import { createApiClient } from "../api/client";
import { ApiError } from "../api/errors";
import { readPublicEnv } from "../config/env";
import { createQueryClient, sessionQueryKey } from "../query/client";
import { SessionManager, endSession } from "../session";
import { deferred, memoryStore, passwordGrant, tokens } from "../session/test-fixtures";
import { startRealtime, type SocketHandlers } from "./connection";

async function harness() {
  const queryClient = createQueryClient(),
    store = memoryStore(),
    grant = jest.fn(async () => tokens("current")),
    cancel = jest.fn(async () => {}),
    response = deferred<Response>(),
    entered = deferred<void>();
  queryClient.setDefaultOptions({ queries: { gcTime: Infinity, retry: false } });
  const manager = new SessionManager({
    store,
    onBoundary: () => queryClient.clear(),
    transport: { grant, revoke: async () => {} },
  });
  await manager.signIn(passwordGrant);
  const transport = jest.fn(async () => {
    entered.resolve();
    return response.promise;
  });
  const api = createApiClient(readPublicEnv({}, "ios", false), manager, undefined, transport);
  let handlers: SocketHandlers | undefined, changeState: ((state: string) => void) | undefined;
  const stop = startRealtime({
    session: manager,
    queryClient,
    appState: {
      current: () => "active",
      subscribe: (listener) => {
        changeState = listener;
        return () => {};
      },
    },
    ticket: async () => ({ token: "ticket", expiresAt: "2099-01-01T00:00:00Z" }),
    socket: (_ticket, listener) => {
      handlers = listener;
      return { connect: () => listener.connected(), close: () => {} };
    },
    revalidate: async (signal) => {
      await api.GET("/me", { signal });
    },
    onRevoked: () => endSession({ manager, oauth: { cancel } }),
  });
  await jest.advanceTimersByTimeAsync(0);
  const key = [...sessionQueryKey(manager.generation(), "en"), "private"];
  queryClient.setQueryData(key, ["private"]);
  handlers!.event("session.revoked", { meta: { reason: "revoked" } });
  await entered.promise;
  return {
    queryClient,
    store,
    manager,
    grant,
    cancel,
    response,
    key,
    stop,
    changeState,
    transport,
  };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each(["stop", "background", "account"] as const)(
  "a cancelled authenticated probe cannot start refresh after %s",
  async (boundary) => {
    const scope = await harness();
    if (boundary === "stop") scope.stop();
    else if (boundary === "background") scope.changeState!("background");
    else {
      scope.grant.mockResolvedValueOnce(tokens("new-account"));
      await scope.manager.signIn(passwordGrant);
      scope.queryClient.setQueryData(scope.key, ["new-private"]);
    }
    scope.response.resolve(
      new Response(JSON.stringify({ errors: [{ code: "auth.token_expired" }] }), { status: 401 }),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(scope.grant).toHaveBeenCalledTimes(boundary === "account" ? 2 : 1);
    expect(scope.manager.snapshot().status).toBe("authenticated");
    expect(scope.manager.snapshot().sessionId).toBe(
      boundary === "account" ? "new-account" : "current",
    );
    expect(scope.queryClient.getQueryData(scope.key)).toEqual(
      boundary === "account" ? ["new-private"] : ["private"],
    );
    expect(scope.cancel).not.toHaveBeenCalled();
    scope.stop();
    scope.queryClient.clear();
  },
);
test.each([new TypeError("Network unavailable"), new ApiError(503)])(
  "an expired access token followed by a transient refresh failure preserves the session and cache (%s)",
  async (error) => {
    const scope = await harness();
    scope.grant.mockRejectedValueOnce(error);
    scope.response.resolve(
      new Response(JSON.stringify({ errors: [{ code: "auth.token_expired" }] }), { status: 401 }),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(scope.manager.snapshot()).toMatchObject({ status: "authenticated", networkError: true });
    expect(scope.store.value).not.toBeNull();
    expect(scope.queryClient.getQueryData(scope.key)).toEqual(["private"]);
    expect(scope.cancel).not.toHaveBeenCalled();
    scope.stop();
    scope.queryClient.clear();
  },
);
test("a shared refresh may settle after stop without retrying the retired probe", async () => {
  const scope = await harness(),
    refreshed = deferred<ReturnType<typeof tokens>>();
  scope.grant.mockReturnValueOnce(refreshed.promise);
  scope.response.resolve(
    new Response(JSON.stringify({ errors: [{ code: "auth.token_expired" }] }), { status: 401 }),
  );
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.grant).toHaveBeenCalledTimes(2);
  scope.stop();
  refreshed.resolve(tokens("rotated"));
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.manager.snapshot()).toMatchObject({ status: "authenticated", sessionId: "rotated" });
  expect(scope.transport).toHaveBeenCalledTimes(1);
  expect(scope.queryClient.getQueryData(scope.key)).toEqual(["private"]);
  expect(scope.cancel).not.toHaveBeenCalled();
  scope.queryClient.clear();
});
test("a delayed unauthorized body from an offline refresh cannot revoke newer credentials", async () => {
  const scope = await harness(),
    body = deferred<unknown>();
  scope.grant.mockRejectedValueOnce(new TypeError("Network unavailable"));
  const response = new Response("", { status: 401 });
  response.json = () => body.promise;
  scope.response.resolve(response);
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.manager.snapshot().networkError).toBe(true);
  scope.grant.mockResolvedValueOnce(tokens("rotated"));
  await scope.manager.refresh(scope.manager.credentials()!);
  expect(scope.manager.snapshot().networkError).toBe(false);
  body.resolve({ errors: [{ code: "auth.token_expired" }] });
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.manager.snapshot()).toMatchObject({ status: "authenticated", sessionId: "rotated" });
  expect(scope.store.value?.sessionId).toBe("rotated");
  expect(scope.queryClient.getQueryData(scope.key)).toEqual(["private"]);
  expect(scope.cancel).not.toHaveBeenCalled();
  scope.stop();
  scope.queryClient.clear();
});
test("a genuine unauthorized response for the retried token still ends the session", async () => {
  const scope = await harness();
  scope.grant.mockResolvedValueOnce(tokens("rotated"));
  scope.response.resolve(
    new Response(JSON.stringify({ errors: [{ code: "auth.token_invalid" }] }), { status: 401 }),
  );
  await jest.advanceTimersByTimeAsync(0);
  expect(scope.transport).toHaveBeenCalledTimes(2);
  expect(scope.manager.snapshot().status).toBe("anonymous");
  expect(scope.store.value).toBeNull();
  expect(scope.queryClient.getQueryData(scope.key)).toBeUndefined();
  expect(scope.cancel).toHaveBeenCalledTimes(1);
  scope.stop();
  scope.queryClient.clear();
});
