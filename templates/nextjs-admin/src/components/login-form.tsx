"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SubmitButton } from "./submit-button";
import type { LoginAction, LoginState } from "../lib/admin/state";

export function LoginForm({
  loginAction,
  permalink,
}: {
  loginAction: LoginAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<LoginState, FormData>(
    loginAction,
    { ok: true },
    permalink,
  );
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <section className="mx-auto w-full max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t("login")}</h1>
      <form action={action} className="space-y-4">
        {(["email", "password"] as const).map((name) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={name}>{t(name === "password" ? "passwordLabel" : name)}</Label>
            <Input
              id={name}
              name={name}
              type={name}
              required
              autoComplete={name === "email" ? "email" : "current-password"}
              defaultValue={name === "email" ? (state.email ?? "") : undefined}
              aria-invalid={Boolean(errors[name]?.length)}
              aria-describedby={errors[name]?.length ? `${name}-errors` : undefined}
            />
            {errors[name]?.length && (
              <div id={`${name}-errors`} className="text-sm text-destructive">
                {errors[name]!.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
          </div>
        ))}
        {!state.ok && state.formError && (
          <p role="alert" className="whitespace-pre-line text-sm text-destructive">
            {state.formError}
          </p>
        )}
        {state.retryAfter != null && <p>{t("retryAfter", { seconds: state.retryAfter })}</p>}
        <SubmitButton>{t("login")}</SubmitButton>
      </form>
    </section>
  );
}
