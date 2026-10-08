"use client";
import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname } from "../lib/i18n/navigation";
import { changeLocaleAction } from "../lib/admin/actions";
import { SubmitButton } from "./submit-button";
import type { LocaleState } from "../lib/admin/state";

function LocaleButton({
  target,
  returnTo,
  disabled,
}: {
  target: "ko" | "en";
  returnTo: string;
  disabled: boolean;
}) {
  const t = useTranslations("locale");
  const auth = useTranslations("auth");
  const [state, action] = useActionState<LocaleState, FormData>(
    changeLocaleAction.bind(null, target, returnTo),
    { ok: true },
  );
  return (
    <form action={action}>
      <SubmitButton disabled={disabled}>{t(target)}</SubmitButton>
      {!state.ok && state.formError && <p role="alert">{state.formError}</p>}
      {state.retryAfter != null && <p>{auth("retryAfter", { seconds: state.retryAfter })}</p>}
    </form>
  );
}

export function AccountLocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("locale");
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;
  return (
    <nav aria-label={t("switcher")} className="flex gap-1">
      {(["ko", "en"] as const).map((target) => (
        <LocaleButton
          key={target}
          target={target}
          returnTo={returnTo}
          disabled={target === locale}
        />
      ))}
    </nav>
  );
}
