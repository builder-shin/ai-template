"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import { Link } from "../../lib/i18n/navigation";
import { FormErrors } from "./form-feedback";
import type { AuthAction, AuthResult } from "./state";

export function VerificationForm({
  token,
  verifyAction,
  permalink,
}: {
  token: string;
  verifyAction: AuthAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const errors = useTranslations("errors");
  const [state, action] = useActionState<AuthResult, FormData>(
    verifyAction,
    { ok: false, formError: null, fieldErrors: {} },
    permalink,
  );
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t("verifyEmail")}</h1>
      {state.ok ? (
        <p role="status">{t("verificationComplete")}</p>
      ) : token ? (
        <form action={action} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm">{t("confirmVerification")}</p>
          <FormErrors state={state} />
          <SubmitButton>{t("verifyEmail")}</SubmitButton>
        </form>
      ) : (
        <p role="alert" className="text-sm text-destructive">
          {errors("auth.verification_token_invalid")}
        </p>
      )}
      <div className="flex gap-4 text-sm underline">
        <Link href="/login">{t("login")}</Link>
        {!state.ok && <Link href="/signup">{t("signup")}</Link>}
      </div>
    </div>
  );
}
