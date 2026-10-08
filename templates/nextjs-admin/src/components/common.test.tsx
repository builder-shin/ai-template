import { ko, en } from "../lib/i18n/catalogs";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode } from "react";
import { LocaleSwitcher } from "./locale-switcher";
import { Spinner } from "./spinner";
import { ErrorBoundary } from "./error-boundary";

const navigation = vi.hoisted(() => ({ pathname: "/", query: "" }));
// Next 요청 저장소만 대체한다. 번역·로케일 링크와 Base UI는 실제 구현이다.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));
afterEach(() => {
  cleanup();
  navigation.pathname = "/";
  navigation.query = "";
});
function show(children: ReactNode, locale: "ko" | "en" = "ko") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      {children}
    </NextIntlClientProvider>,
  );
}

describe("로케일 전환", () => {
  it.each([
    ["ko", "/me", "page=2&tag=a&tag=b", "/en/me?page=2&tag=a&tag=b"],
    // 기본 언어 전환은 /ko에서 쿠키를 갱신한 뒤 proxy가 접두사를 지운다.
    ["en", "/en/me", "page=2", "/ko/me?page=2"],
  ] as const)("%s에서 경로·쿼리를 유지한다", (locale, pathname, query, target) => {
    navigation.pathname = pathname;
    navigation.query = query;
    show(<LocaleSwitcher />, locale);
    const other = screen.getByRole("link", { name: locale === "ko" ? "English" : "한국어" });
    expect(other.getAttribute("href")).toBe(target);
    expect(other.getAttribute("lang")).toBe(locale === "ko" ? "en" : "ko");
    const current = screen.getByRole("link", { name: locale === "ko" ? "한국어" : "English" });
    expect(current.getAttribute("aria-current")).toBe("page");
  });
});

it("스피너는 보이는 문구 없이 접근 가능한 이름만 가진다", () => {
  const { container } = show(<Spinner />);
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  expect(container.textContent).toBe("");
  expect(container.querySelector("svg")?.classList.contains("lucide-loader-circle")).toBe(true);
});

describe("오류 경계", () => {
  it.each(["ko", "en"] as const)("%s 안내와 trace를 보여 주고 다시 시도한다", async (locale) => {
    let retries = 0;
    const trace = "0123456789abcdef0123456789abcdef";
    const error = Object.assign(new Error("private server detail"), { digest: trace });
    const { container } = show(
      <ErrorBoundary
        error={error}
        retry={() => {
          retries++;
        }}
      />,
      locale,
    );
    expect(screen.getByRole("alert").textContent).toContain(trace);
    expect(container.textContent).not.toContain("private server detail");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: locale === "ko" ? "다시 시도" : "Try again" }));
    expect(retries).toBe(1);
  });
  it("식별자가 없는 클라이언트 오류에 거짓 trace를 만들지 않는다", () => {
    show(<ErrorBoundary error={new Error("private")} retry={() => {}} />);
    expect(screen.queryByText(/추적 ID/)).toBeNull();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
  });
});
