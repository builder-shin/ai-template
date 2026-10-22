import { Stack, Redirect, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSession } from "./context";
import { safeReturnPath } from "../links/intent";
import { Spinner } from "../../components/spinner";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { useColorScheme, View } from "react-native";
import { useState } from "react";
import { protectedScreens } from "../navigation/features";
export function ProtectedLayout() {
  const { state, manager } = useSession(),
    path = usePathname(),
    { t } = useTranslation();
  const dark = useColorScheme() === "dark",
    [retrying, setRetrying] = useState(false);
  const retry = () => {
    const credentials = manager.credentials();
    setRetrying(true);
    void (credentials ? manager.refresh(credentials) : manager.restore())
      .catch(() => undefined)
      .finally(() => setRetrying(false));
  };
  if (state.status === "restoring")
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  if (state.networkError && state.status !== "authenticated")
    return (
      <Screen>
        <Text accessibilityRole="alert">{t("offline")}</Text>
        <Button title={t("retry")} pending={retrying} onPress={retry} />
      </Screen>
    );
  if (state.status !== "authenticated")
    return <Redirect href={{ pathname: "/login", params: { returnTo: safeReturnPath(path) } }} />;
  return (
    <View style={{ flex: 1 }}>
      {state.networkError && (
        <View style={{ padding: 16 }}>
          <Text accessibilityRole="alert">{t("offline")}</Text>
          <Button title={t("retry")} pending={retrying} onPress={retry} />
        </View>
      )}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: dark ? "#101828" : "#f8fafc" },
          headerTintColor: dark ? "#f8fafc" : "#101828",
        }}
      >
        <Stack.Protected guard={state.status === "authenticated"}>
          {protectedScreens.map((item) => (
            <Stack.Screen key={item.name} name={item.name} options={{ title: t(item.titleKey) }} />
          ))}
        </Stack.Protected>
      </Stack>
    </View>
  );
}
