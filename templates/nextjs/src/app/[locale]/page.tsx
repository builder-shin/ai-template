import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../lib/i18n/routing";
import { Link } from "../../lib/i18n/navigation";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "home" });
  return (
    <section className="flex flex-col gap-3 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link
        href="/posts"
        className="mt-3 self-start rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("posts")}
      </Link>
    </section>
  );
}
