import { ko, en } from "../lib/i18n/catalogs";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactNode } from "react";
import { Header } from "./header";
import { NotFound } from "./not-found";

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

describe("헤더", () => {
  it("비로그인 상태에 홈과 로그인 링크를 보여 준다", () => {
    show(<Header user={null} logoutAction={async () => {}} />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/");
    expect(header.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe("/login");
    expect(header.queryByRole("button")).toBeNull();
  });
  it.each(["마우스", "키보드"])("세션이 있으면 %s로 이름과 로그아웃 메뉴를 연다", async (input) => {
    const user = userEvent.setup();
    let logouts = 0;
    show(
      <Header
        user={{ name: "관리자" }}
        logoutAction={async () => {
          logouts++;
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: "로그인" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "사용자 메뉴: 관리자" });
    if (input === "마우스") await user.click(trigger);
    else {
      trigger.focus();
      await user.keyboard("{Enter}");
    }
    const logout = await screen.findByRole("menuitem", { name: "로그아웃" });
    expect(logout.getAttribute("aria-disabled")).not.toBe("true");
    if (input === "마우스") await user.click(logout);
    else {
      logout.focus();
      await user.keyboard("{Enter}");
    }
    expect(logouts).toBe(1);
  });
  it.each([
    ["ko", "마우스"],
    ["ko", "키보드"],
    ["en", "마우스"],
    ["en", "키보드"],
  ] as const)("%s 사용자 메뉴의 내 정보를 %s로 활성화한다", async (locale, input) => {
    const user = userEvent.setup();
    let logouts = 0;
    show(
      <Header
        user={{ name: "관리자" }}
        logoutAction={async () => {
          logouts++;
        }}
      />,
      locale,
    );
    const trigger = screen.getByRole("button", {
      name: locale === "ko" ? "사용자 메뉴: 관리자" : "User menu: 관리자",
    });
    if (input === "마우스") await user.click(trigger);
    else {
      trigger.focus();
      await user.keyboard("{Enter}");
    }
    const label = locale === "ko" ? "내 정보" : "My profile";
    const profile = await screen.findByRole("menuitem", { name: label });
    const href = locale === "ko" ? "/me" : "/en/me";
    expect(profile.tagName).toBe("A");
    expect(profile.getAttribute("href")).toBe(href);
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: label })).toBeNull();
    // jsdom의 페이지 이동 대신 실제 링크 클릭에 실린 목적지를 확인한다.
    let destination: string | null = null;
    profile.addEventListener(
      "click",
      (event) => {
        destination = profile.getAttribute("href");
        event.preventDefault();
      },
      { once: true },
    );
    if (input === "마우스") await user.click(profile);
    else {
      profile.focus();
      await user.keyboard("{Enter}");
    }
    expect(destination).toBe(href);
    expect(logouts).toBe(0);
  });
  it("이름이 없는 계정에는 번역한 대체 이름을 쓴다", async () => {
    show(<Header user={{ name: null }} logoutAction={async () => {}} />, "en");
    expect(screen.getByRole("button", { name: "User menu: User" })).toBeTruthy();
  });
  it("로그아웃을 제출하면 메뉴를 막고 사용자 버튼에 스피너를 보여 준다", async () => {
    let finish!: () => void;
    show(
      <Header
        user={{ name: "관리자" }}
        logoutAction={async () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", {
      name: "사용자 메뉴: 관리자",
    }) as HTMLButtonElement;
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "로그아웃" }));
    expect(trigger.disabled).toBe(true);
    expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
    await act(async () => finish());
    expect(trigger.disabled).toBe(false);
  });
});

it.each(["ko", "en"] as const)("%s not-found에 접근 가능한 제목과 홈 링크가 있다", (locale) => {
  show(<NotFound />, locale);
  expect(
    screen.getByRole("heading", {
      name: locale === "ko" ? "페이지를 찾을 수 없습니다" : "Page not found",
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: locale === "ko" ? "홈으로" : "Go home" }).getAttribute("href"),
  ).toBe(locale === "ko" ? "/" : "/en");
});
