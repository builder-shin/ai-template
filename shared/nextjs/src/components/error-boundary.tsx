"use client";

import { useTranslations } from "next-intl";
import { Link } from "../lib/i18n/navigation";
import { Button } from "./ui/button";

export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errorPage");
  return (
    <section className="flex flex-col gap-4 py-10">
      <div role="alert" className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        {error.digest && (
          <p className="break-all text-sm">{t("traceId", { traceId: error.digest })}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={retry}>{t("retry")}</Button>
        <Link
          href="/"
          className="rounded-md text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("home")}
        </Link>
      </div>
    </section>
  );
}
