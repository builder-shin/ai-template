import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTimeZone, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { routing } from "../../lib/i18n/routing";
import { readSession } from "../../lib/session/request";
import { RealtimeProvider } from "../../lib/realtime";
import { getEnv } from "../../lib/env";
import "../globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home");
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [messages, timeZone, t, session] = await Promise.all([
    getMessages(),
    getTimeZone(),
    getTranslations("layout"),
    readSession(),
  ]);
  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <RealtimeProvider
            url={getEnv().NEXT_PUBLIC_REALTIME_URL}
            sessionKey={session?.sessionId ?? null}
          >
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
            >
              {t("skipToContent")}
            </a>
            {children}
          </RealtimeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
