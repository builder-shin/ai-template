import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { AuthApi } from "./api";
import { emailFormSchema, resetSchema } from "./schemas";
import { AuthNavigation } from "./signup-screen";
import { endSession, useSession } from "../../lib/session";
import { useSubmit } from "../../lib/forms/use-submit";
import { fieldError } from "../../lib/forms/errors";
import { Screen } from "../../components/screen";
import { Field } from "../../components/field";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { LanguagePicker } from "../../components/language-picker";
import { RequestError } from "../../components/request-state";

export function EmailRequestForm({
  kind,
  request,
}: {
  kind: "reset" | "verify";
  request: (email: string) => Promise<void>;
}) {
  const { t } = useTranslation(),
    submit = useSubmit();
  const form = useForm({ resolver: zodResolver(emailFormSchema), defaultValues: { email: "" } });
  const send = form.handleSubmit(({ email }) => submit.run(() => request(email)));
  const remote = fieldError(submit.error, "email");
  return (
    <>
      <Controller
        control={form.control}
        name="email"
        render={({ field }) => (
          <Field
            label={t("email")}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!submit.pending}
            returnKeyType="send"
            onSubmitEditing={() => {
              void send();
            }}
            error={remote ? t(remote) : form.formState.errors.email ? t("invalidField") : undefined}
          />
        )}
      />
      <Button
        title={t(kind === "reset" ? "sendReset" : "resendVerification")}
        pending={submit.pending}
        onPress={() => {
          void send();
        }}
      />
      <RequestError error={submit.error} />
      {submit.succeeded && <Text accessibilityRole="alert">{t("mailSent")}</Text>}
    </>
  );
}
export function ForgotPasswordScreen() {
  const { api } = useSession(),
    { t } = useTranslation();
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("forgotPassword")}</Text>
      <EmailRequestForm kind="reset" request={(email) => new AuthApi(api).requestReset(email)} />
      <AuthNavigation />
    </Screen>
  );
}
export function ResetForm({
  token,
  reset,
}: {
  token: string | null;
  reset: (token: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation(),
    submit = useSubmit();
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: "" } });
  const send = form.handleSubmit(({ password }) =>
    submit.run(async () => {
      if (!token) return;
      try {
        await reset(token, password);
      } finally {
        form.resetField("password");
      }
    }),
  );
  const remote = fieldError(submit.error, "password");
  return (
    <>
      {!token && <Text accessibilityRole="alert">{t("invalidLink")}</Text>}
      <Controller
        control={form.control}
        name="password"
        render={({ field }) => (
          <Field
            label={t("password")}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            secureTextEntry
            editable={!submit.pending && !!token}
            returnKeyType="done"
            onSubmitEditing={() => {
              void send();
            }}
            error={
              remote ? t(remote) : form.formState.errors.password ? t("passwordLength") : undefined
            }
          />
        )}
      />
      <RequestError error={submit.error} />
      {submit.succeeded && <Text accessibilityRole="alert">{t("passwordReset")}</Text>}
      <Button
        title={t("resetPassword")}
        pending={submit.pending}
        disabled={!token || submit.succeeded}
        onPress={() => {
          void send();
        }}
      />
    </>
  );
}
export function ResetPasswordScreen({ token }: { token: string | null }) {
  const scope = useSession(),
    { t } = useTranslation();
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("resetPassword")}</Text>
      <ResetForm
        token={token}
        reset={async (value, password) => {
          await new AuthApi(scope.api).reset(value, password);
          await endSession(scope);
        }}
      />
      <EmailRequestForm
        kind="reset"
        request={(email) => new AuthApi(scope.api).requestReset(email)}
      />
      <AuthNavigation />
    </Screen>
  );
}
