// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { act, type ReactNode } from "react";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import { Header } from "./header";
import { LocaleSwitcher } from "./locale-switcher";
import { Spinner } from "./spinner";
import { ErrorBoundary } from "./error-boundary";
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
    expect(screen.getByRole("link", { name: "내 정보" }).getAttribute("href")).toBe("/me");
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
