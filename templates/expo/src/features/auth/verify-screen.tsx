import { useTranslation } from "react-i18next";
import { AuthApi } from "./api";
import { EmailRequestForm } from "./reset-screen";
import { AuthNavigation } from "./signup-screen";
import { useSession } from "../../lib/session";
import { useSubmit } from "../../lib/forms/use-submit";
import { Screen } from "../../components/screen";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { RequestError } from "../../components/request-state";
import { LanguagePicker } from "../../components/language-picker";

export function VerificationForm({
  token,
  verify,
}: {
  token: string | null;
  verify: (token: string) => Promise<void>;
}) {
  const { t } = useTranslation(),
    submit = useSubmit();
  return (
    <>
      {!token && <Text accessibilityRole="alert">{t("invalidLink")}</Text>}
      <RequestError error={submit.error} />
      {submit.succeeded && <Text accessibilityRole="alert">{t("verified")}</Text>}
      <Button
        title={t("verifyEmail")}
        pending={submit.pending}
        disabled={!token || submit.succeeded}
        onPress={() => {
          if (token) void submit.run(() => verify(token));
        }}
      />
    </>
  );
}
export function VerifyEmailScreen({ token }: { token: string | null }) {
  const { api } = useSession(),
    { t } = useTranslation();
  const auth = new AuthApi(api);
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("verifyEmail")}</Text>
      <VerificationForm token={token} verify={(value) => auth.verify(value)} />
      <EmailRequestForm kind="verify" request={(email) => auth.requestVerification(email)} />
      <AuthNavigation />
    </Screen>
  );
}
