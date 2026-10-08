import { ko, en } from "../../lib/i18n/catalogs";
// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { DeleteAccountForm } from "./deletion-form";
import type { DeletionResult } from "./state";

afterEach(cleanup);
function show(
  locale: "ko" | "en",
  action: (state: DeletionResult, data: FormData) => Promise<DeletionResult>,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>
      <DeleteAccountForm
        action={action}
        permalink={locale === "ko" ? "/me/delete" : "/en/me/delete"}
      />
    </NextIntlClientProvider>,
  );
}
it.each(["ko", "en"] as const)(
  "%s 확인 전에는 제출하지 않고 확인 후 값을 보낸다",
  async (locale) => {
    const action = vi.fn(
      async (_state: DeletionResult, _data: FormData): Promise<DeletionResult> => ({ ok: true }),
    );
    show(locale, action);
    const t = (locale === "ko" ? ko : en).me.deletion;
    const checkbox = screen.getByRole("checkbox", { name: t.confirmation }) as HTMLInputElement;
    const button = screen.getByRole("button", { name: t.submit });
    expect([checkbox.name, checkbox.required, checkbox.checked]).toEqual(["confirm", true, false]);
    const user = userEvent.setup();
    await user.click(button);
    expect(action).not.toHaveBeenCalled();
    await user.click(checkbox);
    await user.click(button);
    expect(action.mock.calls[0]![1].get("confirm")).toBe("on");
  },
);
it("마지막 관리자 오류에 다른 관리자 지정 안내를 더한다", async () => {
  show("ko", async () => ({
    ok: false,
    formError: "마지막 관리자",
    fieldErrors: {},
    lastAdminProtected: true,
  }));
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "탈퇴하기" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "마지막 관리자");
  expect(screen.getByText("다른 활성 사용자를 관리자로 지정한 뒤 탈퇴해 주세요.")).toBeTruthy();
});
it("제출 중 스피너만 보이고 실패한 폼은 다시 제출할 수 있다", async () => {
  let finish!: (state: DeletionResult) => void;
  show(
    "en",
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  const button = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  await act(async () =>
    finish({ ok: false, formError: "Try later", fieldErrors: {}, retryAfter: 7 }),
  );
  expect(button.disabled).toBe(false);
  expect(screen.getByText("Try again in 7 seconds.")).toBeTruthy();
});
