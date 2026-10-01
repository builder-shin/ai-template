// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { SessionsList, SessionsSkeleton } from "./components";
import type { SessionsResult } from "./state";

afterEach(cleanup);
const items = [
  {
    id: "current-id",
    current: true,
    userAgent: "Current browser",
    createdAt: "2026-09-30T01:00:00Z",
    lastUsedAt: "2026-10-01T01:00:00Z",
  },
  {
    id: "other-id",
    current: false,
    userAgent: null,
    createdAt: "2026-09-29T01:00:00Z",
    lastUsedAt: "2026-09-30T01:00:00Z",
  },
];
function show(
  locale: "ko" | "en",
  revoke: (
    id: string,
    state: SessionsResult,
    data: FormData,
  ) => Promise<SessionsResult> = async () => ({ ok: true, revokedCount: 1 }),
  others: (state: SessionsResult, data: FormData) => Promise<SessionsResult> = async () => ({
    ok: true,
    revokedCount: 0,
  }),
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      <SessionsList
        items={items}
        revokeAction={revoke}
        othersAction={others}
        allAction={async () => ({ ok: true })}
        permalink={locale === "ko" ? "/me/sessions" : "/en/me/sessions"}
      />
    </NextIntlClientProvider>,
  );
}
it.each(["ko", "en"] as const)(
  "%s 현재 세션·알 수 없는 기기·시간과 개별 폐기를 표시한다",
  async (locale) => {
    const revoked: string[] = [];
    show(locale, async (id) => {
      revoked.push(id);
      return { ok: true, revokedCount: 1 };
    });
    const rows = screen.getAllByRole("listitem");
    expect(
      within(rows[0]!).getByText(locale === "ko" ? "현재 세션" : "Current session"),
    ).toBeTruthy();
    expect(
      within(rows[1]!).queryByText(locale === "ko" ? "현재 세션" : "Current session"),
    ).toBeNull();
    expect(
      within(rows[1]!).getByText(locale === "ko" ? "알 수 없는 기기" : "Unknown device"),
    ).toBeTruthy();
    expect(rows[0]!.querySelectorAll("time")).toHaveLength(2);
    expect(rows[0]!.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-30T01:00:00Z");
    await userEvent.setup().click(
      within(rows[1]!).getByRole("button", {
        name: locale === "ko" ? "세션 폐기" : "Revoke session",
      }),
    );
    expect(revoked).toEqual(["other-id"]);
    const message = locale === "ko" ? "세션 1개를 폐기했습니다." : "Revoked 1 session(s).";
    expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
    expect(
      screen.getByRole("button", {
        name: locale === "ko" ? "다른 기기 로그아웃" : "Sign out other devices",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: locale === "ko" ? "전체 로그아웃" : "Sign out everywhere",
      }),
    ).toBeTruthy();
  },
);
it("전체 로그아웃은 확인 체크 전 제출을 막고 JS 없이도 확인 값을 보낸다", async () => {
  const result = show("ko");
  const button = screen.getByRole("button", { name: "전체 로그아웃" }) as HTMLButtonElement;
  const confirm = screen.getByRole("checkbox", {
    name: "이 기기를 포함해 모든 기기에서 로그아웃합니다.",
  }) as HTMLInputElement;
  expect([confirm.name, confirm.required, confirm.checked]).toEqual(["confirm", true, false]);
  expect(button.form).toBe(confirm.form);
  expect(result.container.querySelector('form[id="revoke-all-form"]')).toBeTruthy();
  await userEvent.setup().click(confirm);
  expect(confirm.checked).toBe(true);
});
it("폐기 실패와 재시도 시간을 폼 안내로 표시한다", async () => {
  show("en", async () => ({ ok: false, formError: "Not found", fieldErrors: {}, retryAfter: 9 }));
  await userEvent
    .setup()
    .click(
      within(screen.getAllByRole("listitem")[1]!).getByRole("button", { name: "Revoke session" }),
    );
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Not found");
  expect(screen.getByText("Try again in 9 seconds.")).toBeTruthy();
});
it("일괄 폐기 중 버튼을 막고 보이는 문구 없이 스피너만 표시한다", async () => {
  let finish!: (result: SessionsResult) => void;
  show(
    "ko",
    undefined,
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "다른 기기 로그아웃" }));
  expect(
    (screen.getByRole("button", { name: "다른 기기 로그아웃" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  await act(async () => finish({ ok: true, revokedCount: 0 }));
  expect(screen.getByRole("status").textContent).toBe("세션 0개를 폐기했습니다.");
});
it("빈 목록 안내와 텍스트 없는 스켈레톤", () => {
  const view = render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <SessionsList
        items={[]}
        revokeAction={async () => ({ ok: true })}
        othersAction={async () => ({ ok: true })}
        allAction={async () => ({ ok: true })}
        permalink="/me/sessions"
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByText("활성 세션이 없습니다.")).toBeTruthy();
  view.unmount();
  const skeleton = render(<SessionsSkeleton />);
  expect(skeleton.container.textContent).toBe("");
  expect(skeleton.container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
});
