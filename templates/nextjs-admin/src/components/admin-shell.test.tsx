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
