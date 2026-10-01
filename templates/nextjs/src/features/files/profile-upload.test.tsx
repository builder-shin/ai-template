// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import { ProfileForm } from "../me";
import { createFileAction, readyFileAction } from "./actions";

vi.mock("./actions", () => ({ createFileAction: vi.fn(), readyFileAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
it("아바타 업로드 중 프로필 저장을 막고 ready 파일만 폼 값으로 연결한다", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(createFileAction).mockResolvedValue({
    ok: true,
    id: "new-avatar",
    upload: {
      method: "PUT",
      url: "https://storage.example/put",
      headers: {},
      expiresAt: "2026-10-01T00:00:00Z",
    },
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(readyFileAction).mockResolvedValue({
    ok: true,
    file: { id: "new-avatar", url: "https://storage.example/new" },
  });
  render(
    <NextIntlClientProvider locale="ko" messages={ko} timeZone="Asia/Seoul">
      <ProfileForm
        profile={{
          name: "기존 이름",
          locale: "ko",
          avatar: { id: "avatar-id", url: "https://storage.example/avatar" },
        }}
        permalink="/me"
        action={async () => ({ ok: true, saved: true })}
      />
    </NextIntlClientProvider>,
  );
  await userEvent
    .setup()
    .upload(
      screen.getByLabelText("아바타"),
      new File(["png"], "avatar.png", { type: "image/png" }),
    );
  expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  expect(document.querySelector<HTMLInputElement>('[name="avatar"]')?.value).toBe("avatar-id");
  await act(async () => finish(new Response(null, { status: 200 })));
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(document.querySelector<HTMLInputElement>('[name="avatar"]')?.value).toBe("new-avatar");
});
