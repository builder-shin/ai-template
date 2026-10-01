"use client";

import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SubmitButton } from "../../components/submit-button";
import { Skeleton } from "../../components/ui/skeleton";
import type { RevokeSessionAction, SessionItem, SessionsAction, SessionsResult } from "./state";

function RevokeForm({
  id,
  action,
  permalink,
  label,
  confirm = false,
}: {
  id: string;
  action: SessionsAction;
  permalink: string;
  label: string;
  confirm?: boolean;
}) {
  const t = useTranslations("sessions");
  const [state, submit] = useActionState(action, { ok: true } as SessionsResult, permalink);
  return (
    <form id={id} action={submit} className="space-y-3">
      {confirm && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-1" />
          {t("allConfirmation")}
        </label>
      )}
      {!state.ok && state.formError && (
        <p role="alert" className="whitespace-pre-line text-sm text-destructive">
          {state.formError}
        </p>
      )}
      {state.retryAfter != null && (
        <p className="text-sm">{t("retryAfter", { seconds: state.retryAfter })}</p>
      )}
      {state.ok && state.revokedCount != null && (
        <p role="status" className="text-sm">
          {t("revoked", { count: state.revokedCount })}
        </p>
      )}
      <SubmitButton>{label}</SubmitButton>
    </form>
  );
}

export function SessionsList({
  items,
  revokeAction,
  othersAction,
  allAction,
  permalink,
}: {
  items: SessionItem[];
  revokeAction: RevokeSessionAction;
  othersAction: SessionsAction;
  allAction: SessionsAction;
  permalink: string;
}) {
  const t = useTranslations("sessions");
  const format = useFormatter();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("guidance")}</p>
      {items.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="space-y-3 rounded-lg border p-4">
              <p className="break-all font-medium">{item.userAgent || t("unknownDevice")}</p>
              {item.current && <p className="text-sm font-semibold">{t("current")}</p>}
              <dl className="space-y-1 text-sm text-muted-foreground">
                <div>
                  <dt className="inline">{t("createdAt")}: </dt>
                  <dd className="inline">
                    <time dateTime={item.createdAt}>
                      {format.dateTime(new Date(item.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt className="inline">{t("lastUsedAt")}: </dt>
                  <dd className="inline">
                    <time dateTime={item.lastUsedAt}>
                      {format.dateTime(new Date(item.lastUsedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </dd>
                </div>
              </dl>
              <RevokeForm
                id={`revoke-session-${item.id}`}
                action={revokeAction.bind(null, item.id)}
                permalink={permalink}
                label={t("revoke")}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-5 border-t pt-5">
        <RevokeForm
          id="revoke-others-form"
          action={othersAction}
          permalink={permalink}
          label={t("others")}
        />
        <RevokeForm
          id="revoke-all-form"
          action={allAction}
          permalink={permalink}
          label={t("all")}
          confirm
        />
      </div>
    </div>
  );
}

export function SessionsSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-6" aria-hidden="true">
      <Skeleton className="h-9 w-36" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
