/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { AuthApi } from "../auth";
import { AccountApi } from "./api";
import { createApiClient } from "../../lib/api/client";
import { readPublicEnv } from "../../lib/config/env";
import { SessionManager, createSessionTransport, SessionProvider } from "../../lib/session";
import { memoryStore } from "../../lib/session/test-fixtures";
import { readMockMailLink } from "../../../scripts/mail-link";
import { SignupForm, LoginScreen } from "../auth";
import { render, screen, userEvent } from "@testing-library/react-native";
import i18n from "../../lib/i18n";
import { renderRouter, act } from "expo-router/testing-library";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../../lib/query/client";
import { OAuthController } from "../../lib/links/oauth";
import { ProtectedLayout } from "../../lib/session/protected-layout";
import { SessionsScreen } from "./sessions-screen";
import { Text } from "react-native";
import { protectedRouteStubs } from "../../lib/testing/routes";
import { nodeApiFetch } from "../../lib/testing/api-fetch";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
const host = globalThis as typeof globalThis & {
  __nodeHttp: Pick<
    typeof globalThis,
    "fetch" | "Request" | "Response" | "Headers" | "AbortController" | "AbortSignal"
  >;
  __startMock: () => Promise<{ base: string; stop: () => Promise<void> }>;
};
for (const [name, value] of Object.entries(host.__nodeHttp))
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
let server: Awaited<ReturnType<typeof host.__startMock>>;
beforeAll(async () => {
  server = await host.__startMock();
}, 20000);
test("native Router login and all-session confirmation clear both native credentials and pending OAuth", async () => {
  await i18n.changeLanguage("en");
  const config = readPublicEnv({ EXPO_PUBLIC_API_BASE_URL: `${server.base}/api/v1` }, "ios", false);
  const queryClient = createQueryClient(),
    store = memoryStore();
  // Queries are explicitly cleared below; keep Jest's process free of native cache GC timers.
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
  });
  const manager = new SessionManager({
    store,
    transport: createSessionTransport(config, () => "en", nodeApiFetch),
    onBoundary: () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
  });
  await manager.restore();
  const clear = jest.fn().mockResolvedValue(undefined);
  const oauth = new OAuthController({
    config,
    session: manager,
    pending: { read: async () => null, write: async () => {}, clear, take: async () => null },
    crypto: { create: async () => ({ verifier: "v".repeat(64), challenge: "c".repeat(43) }) },
    browser: async () => ({ type: "cancel" }),
  });
  const value = {
    manager,
    config,
    oauth,
    api: createApiClient(config, manager, () => "en", nodeApiFetch),
  };
  await renderRouter(
    {
      ...protectedRouteStubs(),
      _layout: () => (
        <QueryClientProvider client={queryClient}>
          <SessionProvider value={value}>
            <Stack screenOptions={{ headerShown: false }} />
          </SessionProvider>
        </QueryClientProvider>
      ),
      login: LoginScreen,
      "(app)/_layout": ProtectedLayout,
      "(app)/me/sessions": SessionsScreen,
      index: () => <Text>Public home</Text>,
    },
    { initialUrl: "/login?returnTo=%2Fme%2Fsessions" },
  );
  // Router enables fake timers. Real HTTP needs the host event loop and real retry timers.
  jest.useRealTimers();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "admin@example.com");
  await user.type(screen.getByLabelText("Password"), "admin-password"); // betterleaks:allow mock seed password
  await user.press(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByText("Current session")).toBeTruthy();
  expect(store.value).not.toBeNull();
  const callsAfterLogin = clear.mock.calls.length;
  await user.press(screen.getByRole("button", { name: "Sign out all sessions" }));
  expect(await screen.findByText("Confirm session revocation")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
  await act(async () => {
    await Promise.resolve();
  });
  expect(manager.snapshot().status).toBe("anonymous");
  expect(store.value).toBeNull();
  expect(clear.mock.calls.length).toBeGreaterThan(callsAfterLogin);
  queryClient.clear();
}, 15000);
afterAll(async () => {
  await server?.stop();
});
afterEach(() => {
  jest.useRealTimers();
});
test("native form registration, mail verification, password reset and every session scope use the real mock contract", async () => {
  await i18n.changeLanguage("en");
  const config = readPublicEnv(
    { EXPO_PUBLIC_API_BASE_URL: `${server.base}/api/v1`, EXPO_PUBLIC_FRONTEND_URL: server.base },
    "ios",
    false,
  );
  const store = memoryStore();
  const manager = new SessionManager({
    store,
    transport: createSessionTransport(config, () => "en", nodeApiFetch),
  });
  await manager.restore();
  const client = createApiClient(config, manager, () => "en", nodeApiFetch);
  const auth = new AuthApi(client),
    account = new AccountApi(client);
  const email = "native-flow@example.com",
    password = "native-password"; // betterleaks:allow test password
  await render(<SignupForm register={(values) => auth.register(values)} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Name"), "Native Flow");
  await user.type(screen.getByLabelText("Password"), password);
  await user.press(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("Check your email to verify your account.")).toBeTruthy();
  const grant = { grantType: "password" as const, email, password };
  await expect(manager.signIn(grant)).rejects.toMatchObject({ status: 403 });
  const link = await readMockMailLink({
    apiOrigin: server.base,
    to: email,
    kind: "verify-email",
    config,
  });
  const token = new URL(link).searchParams.get("token")!;
  await auth.verify(token);
  await expect(auth.verify(token)).rejects.toMatchObject({ status: 422 });
  await manager.signIn(grant);
  expect((await account.me()).data.attributes.locale).toBe("en");
  const other = new SessionManager({
    store: memoryStore(),
    transport: createSessionTransport(config, () => "en", nodeApiFetch),
  });
  await other.signIn(grant);
  expect((await account.sessions(1)).data).toHaveLength(2);
  await account.revokeOthers();
  expect((await account.sessions(1)).data).toHaveLength(1);
  await other.signIn(grant);
  await account.revoke(other.snapshot().sessionId!);
  expect((await account.sessions(1)).data).toHaveLength(1);
  await account.revokeAll();
  await manager.signOut();
  await manager.signIn(grant);
  await auth.requestReset(email);
  const resetLink = await readMockMailLink({
    apiOrigin: server.base,
    to: email,
    kind: "reset-password",
    config,
  });
  await auth.reset(new URL(resetLink).searchParams.get("token")!, "changed-password"); // betterleaks:allow test password
  await manager.signOut();
  await expect(manager.signIn(grant)).rejects.toMatchObject({ status: 401 });
  await manager.signIn({ ...grant, password: "changed-password" }); // betterleaks:allow test password
  await account.revoke(manager.snapshot().sessionId!);
  await manager.signOut();
  expect(manager.snapshot().status).toBe("anonymous");
}, 20000);
