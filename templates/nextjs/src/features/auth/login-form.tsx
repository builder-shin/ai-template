"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Link } from "../../lib/i18n/navigation";
import { FormErrors, ResendForm } from "./form-feedback";
import type { AuthAction, AuthResult } from "./state";

const initialResend: AuthResult = { ok: false, formError: null, fieldErrors: {} };

export function LoginForm({
  loginAction,
  resendAction,
  permalink,
}: {
  loginAction: AuthAction;
  resendAction: AuthAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<AuthResult, FormData>(
    loginAction,
    { ok: true },
    permalink,
  );
  const [resendState, resend] = useActionState<AuthResult, FormData>(
    resendAction,
    initialResend,
    permalink,
  );
  const verificationEmail = state.ok ? resendState.verificationEmail : state.verificationEmail;
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t("login")}</h1>
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={state.email ?? ""}
            aria-invalid={Boolean(errors.email?.length)}
            aria-describedby={errors.email?.length ? "email-errors" : undefined}
          />
          {errors.email?.length && (
            <div id="email-errors" className="text-sm text-destructive">
              {errors.email.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t("passwordLabel")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password?.length)}
            aria-describedby={errors.password?.length ? "password-errors" : undefined}
          />
          {errors.password?.length && (
            <div id="password-errors" className="text-sm text-destructive">
              {errors.password.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>
        <FormErrors state={state} />
        <SubmitButton>{t("login")}</SubmitButton>
      </form>
      <div className="flex gap-4 text-sm underline">
        <Link href="/signup">{t("signup")}</Link>
        <Link href="/forgot-password">{t("forgotPasswordLink")}</Link>
      </div>
      {verificationEmail && (
        <ResendForm
          email={verificationEmail}
          action={resend}
          state={resendState.verificationEmail === verificationEmail ? resendState : initialResend}
        />
      )}
    </div>
  );
}
