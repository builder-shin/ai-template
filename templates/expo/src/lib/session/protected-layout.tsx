import { Stack, Redirect, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSession } from "./context";
import { safeReturnPath } from "../links/intent";
import { Spinner } from "../../components/spinner";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { useColorScheme } from "react-native";
import { protectedScreens } from "../navigation/features";
export function ProtectedLayout() {
  const { state, manager } = useSession(),
    path = usePathname(),
    { t } = useTranslation();
  const dark = useColorScheme() === "dark";
  if (state.status === "restoring")
    return (
      <Screen>
        <Spinner />
      </Screen>
    );
  if (state.networkError)
    return (
      <Screen>
        <Text accessibilityRole="alert">{t("offline")}</Text>
        <Button
          title={t("retry")}
          onPress={() => {
            void manager.restore().catch(() => undefined);
          }}
        />
      </Screen>
    );
  if (state.status !== "authenticated")
    return <Redirect href={{ pathname: "/login", params: { returnTo: safeReturnPath(path) } }} />;
  return (
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
  );
}
