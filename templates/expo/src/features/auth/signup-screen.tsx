import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { usePathname, useRouter } from "expo-router";
import { signupSchema, type SignupValues } from "./schemas";
import { AuthApi } from "./api";
import { useSession } from "../../lib/session";
import { locale } from "../../lib/i18n";
import { fieldError } from "../../lib/forms/errors";
import { useSubmit } from "../../lib/forms/use-submit";
import { Screen } from "../../components/screen";
import { Field } from "../../components/field";
import { Button } from "../../components/button";
import { Text } from "../../components/text";
import { LanguagePicker } from "../../components/language-picker";
import { RequestError } from "../../components/request-state";
import type { ReactNode } from "react";

export function SignupForm({
  register,
  footer,
}: {
  register: (values: SignupValues & { locale: "ko" | "en" }) => Promise<void>;
  footer?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", name: "", password: "" },
  });
  const submit = useSubmit();
  const send = form.handleSubmit((values) =>
    submit.run(async () => {
      try {
        await register({ ...values, locale: locale(i18n.language) });
      } finally {
        form.resetField("password");
      }
    }),
  );
  return (
    <Screen>
      <LanguagePicker />
      <Text accessibilityRole="header">{t("signup")}</Text>
      {(["name", "email", "password"] as const).map((name, index, names) => {
        const remote = fieldError(submit.error, name);
        const invalid = form.formState.errors[name]?.message;
        return (
          <Controller
            key={name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <Field
                label={t(name)}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
                error={
                  remote
                    ? t(remote)
                    : invalid
                      ? t(invalid === "passwordLength" ? "passwordLength" : "invalidField")
                      : undefined
                }
                autoCapitalize={name === "name" ? "words" : "none"}
                autoCorrect={false}
                keyboardType={name === "email" ? "email-address" : "default"}
                textContentType={
                  name === "password" ? "newPassword" : name === "email" ? "emailAddress" : "name"
                }
                secureTextEntry={name === "password"}
                editable={!submit.pending}
                returnKeyType={index === names.length - 1 ? "done" : "next"}
                onSubmitEditing={() => {
                  const next = names[index + 1];
                  if (next) form.setFocus(next);
                  else void send();
                }}
              />
            )}
          />
        );
      })}
      <RequestError error={fieldError(submit.error, "email") ? undefined : submit.error} />
      {submit.succeeded && <Text accessibilityRole="alert">{t("checkVerification")}</Text>}
      <Button
        title={t("signup")}
        pending={submit.pending}
        onPress={() => {
          void send();
        }}
      />
      {footer}
    </Screen>
  );
}
export function SignupScreen() {
  const { api } = useSession();
  const auth = new AuthApi(api);
  return <SignupForm register={(values) => auth.register(values)} footer={<AuthNavigation />} />;
}
export function AuthNavigation() {
  const router = useRouter(),
    { t } = useTranslation();
  const path = usePathname();
  return (
    <>
      {path !== "/login" && <Button title={t("login")} onPress={() => router.replace("/login")} />}
      {path !== "/signup" && (
        <Button title={t("signup")} onPress={() => router.replace("/signup")} />
      )}
      {path !== "/forgot-password" && (
        <Button title={t("forgotPassword")} onPress={() => router.replace("/forgot-password")} />
      )}
    </>
  );
}
