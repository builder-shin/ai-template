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

export function SignupForm({
  signupAction,
  resendAction,
  permalink,
}: {
  signupAction: AuthAction;
  resendAction: AuthAction;
  permalink: string;
}) {
  const t = useTranslations("auth");
  const [state, action] = useActionState<AuthResult, FormData>(
    signupAction,
    { ok: true },
    permalink,
  );
  const [resendState, resend] = useActionState<AuthResult, FormData>(
    resendAction,
    initialResend,
    permalink,
  );
  // JS 없는 재발송 응답도 같은 hook 순서와 permalink에서 안내 화면을 복원한다.
  const email = state.verificationEmail ?? resendState.verificationEmail;
  const errors = state.ok ? {} : state.fieldErrors;
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">{t(email ? "checkEmail" : "signup")}</h1>
      {email ? (
        <>
          {!resendState.ok && (
            <p role="status" className="text-sm">
              {t("verificationSent")}
            </p>
          )}
          <p className="break-all text-sm">{email}</p>
          <ResendForm email={email} action={resend} state={resendState} />
        </>
      ) : (
        <form action={action} className="space-y-4">
          {(
            [
              {
                name: "name",
                label: "name",
                type: "text",
                autoComplete: "name",
                value: state.name,
              },
              {
                name: "email",
                label: "email",
                type: "email",
                autoComplete: "email",
                value: state.email,
              },
              {
                name: "password",
                label: "passwordLabel",
                type: "password",
                autoComplete: "new-password",
                value: undefined,
              },
            ] as const
          ).map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={field.name}>{t(field.label)}</Label>
              <Input
                id={field.name}
                name={field.name}
                type={field.type}
                required
                autoComplete={field.autoComplete}
                defaultValue={field.value ?? ""}
                aria-invalid={Boolean(errors[field.name]?.length)}
                aria-describedby={errors[field.name]?.length ? `${field.name}-errors` : undefined}
              />
              {errors[field.name]?.length && (
                <div id={`${field.name}-errors`} className="text-sm text-destructive">
                  {errors[field.name]!.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
          <FormErrors state={state} />
          <SubmitButton>{t("signup")}</SubmitButton>
        </form>
      )}
      <Link href="/login" className="text-sm underline">
        {t("login")}
      </Link>
    </div>
  );
}
