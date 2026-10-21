import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "../../components/text";
import { useTranslation } from "react-i18next";
import { Screen } from "../../components/screen";
import { Spinner } from "../../components/spinner";
import { Button } from "../../components/button";
import { useSession } from "../../lib/session";

export default function Callback() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { state, oauth, config } = useSession();
  const seen = useRef(false);
  const [error, setError] = useState(false);
  const key = typeof params.code === "string" ? "code" : "error";
  const value = params[key];
  const valid = Object.keys(params).length === 1 && typeof value === "string";
  useEffect(() => {
    if (state.status === "restoring" || seen.current) return;
    seen.current = true;
    if (!valid) {
      setError(true);
      return;
    }
    void oauth
      .finishOAuth(
        `${config.scheme}://oauth/callback?${new URLSearchParams({ [key]: value as string })}`,
      )
      .then(() => router.replace("/"))
      .catch(() => setError(true));
  }, [state.status, oauth, config.scheme, key, value, valid, router]);
  return (
    <Screen>
      {error ? (
        <>
          <Text accessibilityRole="alert">{t("error")}</Text>
          <Button title={t("login")} onPress={() => router.replace("/login")} />
        </>
      ) : (
        <Spinner />
      )}
    </Screen>
  );
}
