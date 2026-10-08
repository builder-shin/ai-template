// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";
import { ko } from "../lib/i18n/catalogs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useRouter: () => ({}),
}));
vi.mock("../lib/i18n/navigation", () => ({
  usePathname: () => "/",
  Link: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("../lib/admin/actions", () => ({
  logoutAction: async () => {},
  changeLocaleAction: async () => {},
}));
afterEach(cleanup);
it("계정 정보·언어·로그아웃과 좁은 화면 메뉴 시트를 제공한다", async () => {
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AdminShell account={{ name: "관리자", email: "admin@example.com" }}>본문</AdminShell>
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("관리자")).toBeDefined();
  expect(screen.getByText("admin@example.com")).toBeDefined();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeDefined();
  expect(screen.getByRole("navigation", { name: "언어 선택" })).toBeDefined();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "메뉴 열기" }));
  expect(screen.getByRole("dialog", { name: "관리 메뉴" })).toBeDefined();
  await user.click(screen.getByRole("button", { name: "메뉴 닫기" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("전달한 메뉴 순서를 데스크톱과 시트에서 보존한다", async () => {
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <AdminShell
        account={{ name: null, email: null }}
        menu={[
          { href: "/roles", label: "역할" },
          { href: "/posts", label: "글" },
        ]}
      >
        본문
      </AdminShell>
    </NextIntlClientProvider>,
  );
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "관리",
    "역할",
    "글",
  ]);
  await userEvent.setup().click(screen.getByRole("button", { name: "메뉴 열기" }));
  expect(screen.getByRole("dialog").querySelectorAll("nav a")).toHaveLength(2);
});
