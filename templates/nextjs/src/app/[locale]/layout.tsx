import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTimeZone, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { routing } from "../../lib/i18n/routing";
import { Header } from "../../components/header";
import { getHeaderUser } from "../../lib/session/user";
import { logoutAction } from "../../features/auth";
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
  const [messages, timeZone, t, user] = await Promise.all([
    getMessages(),
    getTimeZone(),
    getTranslations("layout"),
    getHeaderUser(locale),
  ]);
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
          >
            {t("skipToContent")}
          </a>
          <Header user={user} logoutAction={logoutAction} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 focus:outline-none sm:px-6"
          >
            {children}
          </main>
          <footer className="border-t px-4 py-5 text-center text-sm text-muted-foreground">
            {t("footer")}
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
