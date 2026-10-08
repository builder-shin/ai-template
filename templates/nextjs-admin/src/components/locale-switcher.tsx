"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "../lib/i18n/navigation";
import { routing } from "../lib/i18n/routing";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("locale");
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const href = query ? `${pathname}?${query}` : pathname;
  return (
    <nav aria-label={t("switcher")} className="flex items-center gap-1 text-sm">
      {routing.locales.map((target) => (
        <Link
          key={target}
          href={href}
          locale={target}
          // 현재 언어의 /ko 링크도 쿠키 변경 중 redirect가 다른 언어로 캐시될 수 있다.
          // 언어 링크는 클릭할 때만 요청한다.
          prefetch={false}
          lang={target}
          aria-current={target === locale ? "page" : undefined}
          className="rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:font-semibold"
        >
          {t(target)}
        </Link>
      ))}
    </nav>
  );
}
