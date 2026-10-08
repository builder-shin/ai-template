// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ResourceControls } from "./controls";
import ko from "../../../messages/ko.json";
import shared from "../../../messages/shared/ko.json";
import { intlFixture } from "../../../scripts/test/intl-fixture";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../lib/i18n/navigation", () => ({ useRouter: () => navigation }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function translated(node: React.ReactNode) {
  return (
    <NextIntlClientProvider {...intlFixture({ ...shared, ...ko })}>{node}</NextIntlClientProvider>
  );
}
function show(node: React.ReactNode) {
  return render(translated(node));
}
it("삭제는 확인 전 호출하지 않고 실패 문구를 대화상자에 남긴다", async () => {
  const user = userEvent.setup();
  let calls = 0;
  show(
    <ResourceControls
      controls={[
        {
          label: "삭제",
          confirmation: true,
          destructive: true,
          action: async () => {
            calls++;
            return { ok: false, formError: "시스템 역할은 삭제할 수 없습니다.", fieldErrors: {} };
          },
        },
      ]}
    />,
  );
  await user.click(screen.getByRole("button", { name: "삭제" }));
  expect(calls).toBe(0);
  const dialog = await screen.findByRole("dialog", { name: "삭제" });
  await user.click(within(dialog).getByRole("button", { name: "취소" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(calls).toBe(0);
  await user.click(screen.getByRole("button", { name: "삭제" }));
  const reopened = await screen.findByRole("dialog", { name: "삭제" });
  await user.click(within(reopened).getByRole("button", { name: "확인" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "시스템 역할은 삭제할 수 없습니다.",
  );
  expect(calls).toBe(1);
});
it("확인 없는 동작은 제출하고 성공하면 화면을 갱신한다", async () => {
  show(<ResourceControls controls={[{ label: "발행", action: async () => ({ ok: true }) }]} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "발행" }));
  expect(navigation.refresh).toHaveBeenCalledOnce();
});
