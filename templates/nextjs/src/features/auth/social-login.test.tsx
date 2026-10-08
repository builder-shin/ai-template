import { ko, en } from "../../lib/i18n/catalogs";
// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LoginForm } from "./login-form";

afterEach(cleanup);
it.each(["ko", "en"] as const)("%s 로그인 링크가 로케일과 목적지를 보존한다", (locale) => {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      <LoginForm
        loginAction={async () => ({ ok: true })}
        resendAction={async () => ({ ok: true })}
        permalink="/login?returnTo=%2Fme%3Ftab%3Dprofile"
        returnTo="/me?tab=profile"
      />
    </NextIntlClientProvider>,
  );
  const names =
    locale === "ko"
      ? ["Google로 로그인", "카카오로 로그인", "네이버로 로그인"]
      : ["Continue with Google", "Continue with Kakao", "Continue with Naver"];
  for (const [index, provider] of ["google", "kakao", "naver"].entries()) {
    const link = screen.getByRole("link", { name: names[index]! });
    const url = new URL(link.getAttribute("href")!, "https://web.example");
    expect(url.pathname).toBe(`/oauth/${provider}/start`);
    expect(url.searchParams.get("returnTo")).toBe("/me?tab=profile");
    expect(url.searchParams.get("locale")).toBe(locale);
  }
});
