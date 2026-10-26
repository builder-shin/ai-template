import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { View } from "react-native";
import { Text } from "../components/text";
import { useTranslation } from "react-i18next";
import i18n, { locale } from "./i18n";
import { createQueryClient } from "./query/client";
import { createApiClient } from "./api/client";
import { runtimeConfig } from "./config/runtime";
import {
  SessionManager,
  SessionProvider,
  createSessionStore,
  createSessionTransport,
  useSession,
} from "./session";
import { Button } from "../components/button";
import { createNativeOAuth } from "./links";
import { SessionLocale } from "./session/locale";
import { RealtimeProvider } from "./realtime";

function StorageNotice() {
  const { state, manager } = useSession();
  const { t } = useTranslation();
  if (!state.storageError && !state.networkError) return null;
  return (
    <View>
      <Text accessibilityRole="alert">
        {t(state.storageError ? "secureStorageError" : "offline")}
      </Text>
      <Button
        title={t("retry")}
        onPress={() => {
          void manager.restore().catch(() => undefined);
        }}
      />
    </View>
  );
}
export function Providers({ children }: PropsWithChildren) {
  const [scope] = useState(() => {
    const queryClient = createQueryClient();
    const config = runtimeConfig();
    let cancelPending = async () => {};
    const manager = new SessionManager({
      store: createSessionStore(),
      transport: createSessionTransport(config, () => locale(i18n.language)),
      onBoundary: () => {
        void queryClient.cancelQueries();
        queryClient.clear();
      },
      onRevoked: (generation) => {
        if (manager.generation() === generation) void cancelPending().catch(() => undefined);
      },
    });
    const oauth = createNativeOAuth(config, manager);
    cancelPending = () => oauth.cancel();
    return {
      queryClient,
      value: {
        manager,
        config,
        api: createApiClient(config, manager, () => locale(i18n.language)),
        oauth,
      },
    };
  });
  useEffect(() => {
    void scope.value.manager.restore().catch(() => undefined);
  }, [scope]);
  return (
    <QueryClientProvider client={scope.queryClient}>
      <SessionProvider value={scope.value}>
        <SessionLocale />
        <RealtimeProvider />
        <StorageNotice />
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
