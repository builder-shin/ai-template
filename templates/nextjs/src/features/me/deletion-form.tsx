"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import type { DeletionAction, DeletionResult } from "./state";

export function DeleteAccountForm({
  action,
  permalink,
}: {
  action: DeletionAction;
  permalink: string;
}) {
  const t = useTranslations("me.deletion");
  const [state, submit] = useActionState(action, { ok: true } as DeletionResult, permalink);
  return (
    <form id="delete-account-form" action={submit} className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("guidance")}</p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" required className="mt-1" />
        {t("confirmation")}
      </label>
      {!state.ok && state.formError && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.lastAdminProtected && <p className="text-sm">{t("lastAdminGuidance")}</p>}
      {state.retryAfter != null && (
        <p className="text-sm">{t("retryAfter", { seconds: state.retryAfter })}</p>
      )}
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}
