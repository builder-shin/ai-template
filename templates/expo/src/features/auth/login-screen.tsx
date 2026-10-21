import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import { loginSchema, emailSchema } from "./schemas";
import { AuthApi } from "./api";
import { AuthNavigation } from "./signup-screen";
import { useSession } from "../../lib/session";
import { safeReturnPath } from "../../lib/links/intent";
import { useSubmit } from "../../lib/forms/use-submit";
import { Screen } from "../../components/screen";
import { Field } from "../../components/field";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { RequestError } from "../../components/request-state";
import { LanguagePicker } from "../../components/language-picker";

export function LoginScreen() {
  const scope = useSession(),
    router = useRouter(),
    params = useLocalSearchParams();
  const { t } = useTranslation();
  const submit = useSubmit(),
    mail = useSubmit();
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const send = form.handleSubmit((values) =>
    submit.run(async () => {
      try {
        await scope.oauth.cancel();
        await scope.manager.signIn({ grantType: "password", ...values });
        if (scope.manager.snapshot().status === "authenticated")
          router.replace(safeReturnPath(params.returnTo));
      } finally {
        form.resetField("password");
      }
    }),
  );
  if (scope.state.status === "authenticated")
    return <Redirect href={safeReturnPath(params.returnTo)} />;
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("login")}</Text>
      {(["email", "password"] as const).map((name) => (
        <Controller
          key={name}
          control={form.control}
          name={name}
          render={({ field }) => (
            <Field
              label={t(name)}
              value={field.value}
              ref={field.ref}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={form.formState.errors[name] ? t("invalidField") : undefined}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={name === "password"}
              textContentType={name === "password" ? "password" : "emailAddress"} // betterleaks:allow native autofill mode, not a credential
              keyboardType={name === "email" ? "email-address" : "default"}
              editable={!submit.pending}
              returnKeyType={name === "email" ? "next" : "go"}
              onSubmitEditing={() => {
                if (name === "email") form.setFocus("password");
                else void send();
              }}
            />
          )}
        />
      ))}
      <RequestError error={submit.error} />
      <Button
        title={t("login")}
        pending={submit.pending}
        onPress={() => {
          void send();
        }}
      />
      <Button
        title={t("resendVerification")}
        pending={mail.pending}
        onPress={() => {
          const parsed = emailSchema.safeParse(form.getValues("email"));
          if (!parsed.success) {
            form.setError("email", { message: "invalidField" });
            form.setFocus("email");
            return;
          }
          void mail.run(() => new AuthApi(scope.api).requestVerification(parsed.data));
        }}
      />
      <RequestError error={mail.error} />
      {mail.succeeded && <Text accessibilityRole="alert">{t("mailSent")}</Text>}
      {(["google", "kakao", "naver"] as const).map((provider) => (
        <Button
          key={provider}
          title={t(`${provider}Login`)}
          pending={submit.pending}
          onPress={() => {
            void submit.run(async () => {
              await scope.oauth.beginOAuth(provider);
              if (scope.manager.snapshot().status === "authenticated")
                router.replace(safeReturnPath(params.returnTo));
            });
          }}
        />
      ))}
      <AuthNavigation />
    </Screen>
  );
}
