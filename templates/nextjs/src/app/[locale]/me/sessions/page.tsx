import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../../lib/i18n/routing";
import { getPathname, Link } from "../../../../lib/i18n/navigation";
import {
  getSessions,
  revokeSessionAction,
  revokeOthersAction,
  revokeAllAction,
  SessionsList,
  parseSessionsPage,
} from "../../../../features/sessions";

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const page = parseSessionsPage((await searchParams).page);
  const [sessions, t] = await Promise.all([
    getSessions(locale, page),
    getTranslations({ locale, namespace: "sessions" }),
  ]);
  const permalink = getPathname({ locale, href: { pathname: "/me/sessions", query: { page } } });
  return (
    <section className="mx-auto max-w-xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <Link href="/me" className="text-sm underline">
        {t("back")}
      </Link>
      <SessionsList
        items={sessions.items}
        revokeAction={revokeSessionAction}
        othersAction={revokeOthersAction}
        allAction={revokeAllAction}
        permalink={permalink}
      />
      {(sessions.previous || sessions.next) && (
        <nav aria-label={t("pagination")} className="flex justify-between gap-4">
          {sessions.previous && (
            <Link href={sessions.previous} className="underline">
              {t("previous")}
            </Link>
          )}
          {sessions.next && (
            <Link href={sessions.next} className="underline">
              {t("next")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
