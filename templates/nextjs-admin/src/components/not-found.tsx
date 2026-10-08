"use client";
import { useTranslations } from "next-intl";
import { Link } from "../lib/i18n/navigation";

export function NotFound() {
  const t = useTranslations("notFound");
  return (
    <section className="space-y-4 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p>{t("description")}</p>
      <Link href="/" className="underline">
        {t("home")}
      </Link>
    </section>
  );
}
