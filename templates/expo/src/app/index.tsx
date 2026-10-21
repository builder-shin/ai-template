import { Text } from "../components/text";
import { Button } from "../components/button";
import { Spinner } from "../components/spinner";
import { AuthNavigation } from "../features/auth";
import { useSession } from "../lib/session";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../components/screen";
export default function Home() {
  const { t } = useTranslation();
  const { state } = useSession(),
    router = useRouter();
  return (
    <Screen>
      <Text>{t("appName")}</Text>
      {state.status === "restoring" ? (
        <Spinner />
      ) : state.status === "authenticated" ? (
        <Button title={t("sessions")} onPress={() => router.push("/me/sessions")} />
      ) : (
        <AuthNavigation />
      )}
    </Screen>
  );
}
