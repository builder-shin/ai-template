"use client";

import { usePathname } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { ko, en } from "../lib/i18n/catalogs";
import { ErrorBoundary } from "../components/error-boundary";
import "./globals.css";

/** 루트 레이아웃 실패에는 기존 문서와 provider가 없으므로 직접 제공한다. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const locale = /^\/en(?:\/|$)/.test(pathname) ? "en" : "ko";
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ko}>
          <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
            <ErrorBoundary error={error} retry={retry} />
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
