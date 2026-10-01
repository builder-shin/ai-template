"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Link } from "../../lib/i18n/navigation";
import { FormErrors } from "./form-feedback";
import type { AuthAction, AuthResult } from "./state";

const initialState: AuthResult = { ok: false, formError: null, fieldErrors: {} };

export function PasswordResetRequestForm({
  requestAction,
  permalink,
}: {
  requestAction: AuthAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<AuthResult, FormData>(
    requestAction,
    initialState,
    permalink,
  );
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t("requestPasswordReset")}</h1>
      {state.ok ? (
        <p role="status" className="text-sm">
          {t("passwordResetSent")}
        </p>
      ) : (
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
          <FormErrors state={state} />
          <SubmitButton>{t("sendResetEmail")}</SubmitButton>
        </form>
      )}
      <Link href="/login" className="text-sm underline">
        {t("login")}
      </Link>
    </div>
  );
}

export function PasswordResetForm({
  token,
  resetAction,
  permalink,
}: {
  token: string;
  resetAction: AuthAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const errorMessages = useTranslations("errors");
  const [state, action] = useActionState<AuthResult, FormData>(
    resetAction,
    initialState,
    permalink,
  );
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t("resetPasswordLabel")}</h1>
      {state.ok ? (
        <p role="status">{t("passwordResetComplete")}</p>
      ) : token ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-2">
            <Label htmlFor="password">{t("newPasswordLabel")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
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
          <SubmitButton>{t("resetPasswordLabel")}</SubmitButton>
        </form>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {errorMessages("auth.verification_token_invalid")}
        </p>
      )}
      <div className="flex gap-4 text-sm underline">
        <Link href="/login">{t("login")}</Link>
        {!state.ok && <Link href="/forgot-password">{t("requestPasswordReset")}</Link>}
      </div>
    </div>
  );
}
