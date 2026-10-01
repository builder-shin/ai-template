"use client";

import { useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import type { AuthResult } from "./state";

export function FormErrors({ state }: { state: AuthResult }) {
  const t = useTranslations("auth");
  if (state.ok) return null;
  return (
    <>
      {state.formError && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.retryAfter != null && (
        <p className="text-sm">{t("retryAfter", { seconds: state.retryAfter })}</p>
      )}
    </>
  );
}

export function ResendForm({
  email,
  action,
  state,
}: {
  email: string;
  action: (data: FormData) => void;
  state: AuthResult;
}) {
  const t = useTranslations("auth");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="email" value={email} />
      <p className="text-sm">{t("verificationGuidance")}</p>
      <FormErrors state={state} />
      {!state.ok &&
        state.fieldErrors.email?.map((message) => (
          <p key={message} role="alert">
            {message}
          </p>
        ))}
      {state.ok && (
        <p role="status" className="text-sm">
          {t("verificationSent")}
        </p>
      )}
      <SubmitButton>{t("resend")}</SubmitButton>
    </form>
  );
}
