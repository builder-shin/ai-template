"use client";

import { useTranslations } from "next-intl";
import { Link } from "../lib/i18n/navigation";

export function NotFound() {
  const t = useTranslations("notFound");
  return (
    <section className="flex flex-col gap-4 py-10">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link
        href="/"
        className="inline-block rounded-md text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("home")}
      </Link>
    </section>
  );
}
