import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { SessionManager, SessionProvider, createSessionTransport, endSession } from "../session";
import { memoryStore } from "../session/test-fixtures";
import { readPublicEnv } from "../config/env";
import { createApiClient } from "../api/client";
import { createQueryClient } from "../query/client";
import { OAuthController } from "../links/oauth";
import i18n, { locale } from "../i18n";
import { nodeApiFetch } from "./api-fetch";

const host = globalThis as typeof globalThis & {
  __nodeHttp: Pick<
    typeof globalThis,
    "fetch" | "Request" | "Response" | "Headers" | "AbortController" | "AbortSignal"
  >;
  __startMock: (options?: {
    fileUserQuota?: number;
  }) => Promise<{ base: string; stop(): Promise<void> }>;
};
export function installNodeHttp() {
  for (const [name, value] of Object.entries(host.__nodeHttp))
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}
export const startMock = (options?: { fileUserQuota?: number }) => host.__startMock(options);
export function createHttpScope(base: string) {
  const config = readPublicEnv(
    {
      EXPO_PUBLIC_API_BASE_URL: `${base}/api/v1`,
      EXPO_PUBLIC_REALTIME_URL: base,
      EXPO_PUBLIC_FRONTEND_URL: base,
    },
    "ios",
    false,
  );
  const queryClient = createQueryClient(),
    store = memoryStore();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
  });
  const language = () => locale(i18n.language);
  let cancelPending = async () => {};
  const manager = new SessionManager({
    store,
    transport: createSessionTransport(config, language, nodeApiFetch),
    onBoundary: () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    },
    onRevoked: (generation) => {
      if (manager.generation() === generation) void cancelPending().catch(() => undefined);
    },
  });
  const oauth = new OAuthController({
    config,
    session: manager,
    pending: {
      read: async () => null,
      take: async () => null,
      write: async () => {},
      clear: async () => {},
    },
    crypto: { create: async () => ({ verifier: "v".repeat(64), challenge: "c".repeat(43) }) },
    browser: async () => ({ type: "cancel" }),
  });
  const value = {
    config,
    manager,
    oauth,
    api: createApiClient(config, manager, language, nodeApiFetch),
  };
  cancelPending = () => oauth.cancel();
  return {
    value,
    store,
    queryClient,
    Wrapper({ children }: PropsWithChildren) {
      return (
        <QueryClientProvider client={queryClient}>
          <SessionProvider value={value}>{children}</SessionProvider>
        </QueryClientProvider>
      );
    },
    async dispose() {
      await endSession(value);
      queryClient.clear();
    },
  };
}
