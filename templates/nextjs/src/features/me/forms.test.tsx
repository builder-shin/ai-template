import { ko, en } from "../../lib/i18n/catalogs";
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ProfileForm, PasswordChangeForm } from "./forms";
import type { ProfileResult, PasswordResult } from "./state";

afterEach(cleanup);
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
const profile = {
  name: "기존 이름",
  locale: "ko" as const,
  avatar: { id: "avatar-id", url: "https://storage.example/avatar" },
};
it.each(["ko", "en"] as const)("%s 프로필의 이름·언어·아바타 값과 저장·해제", async (locale) => {
  let received: FormData | undefined;
  show(
    <ProfileForm
      profile={profile}
      permalink={locale === "ko" ? "/me" : "/en/me"}
      action={async (_state, data) => {
        received = data;
        return { ok: true, saved: true };
      }}
    />,
    locale,
  );
  const name = screen.getByLabelText(locale === "ko" ? "이름" : "Name") as HTMLInputElement;
  expect([name.name, name.required, name.maxLength, name.value]).toEqual([
    "name",
    true,
    100,
    "기존 이름",
  ]);
  const language = screen.getByLabelText(
    locale === "ko" ? "언어" : "Language",
  ) as HTMLSelectElement;
  expect([language.name, language.value]).toEqual(["locale", "ko"]);
  expect(
    screen.getByRole("img", { name: locale === "ko" ? "아바타" : "Avatar" }).getAttribute("src"),
  ).toBe(profile.avatar.url);
  const user = userEvent.setup();
  await user.clear(name);
  await user.type(name, "새 이름");
  await user.selectOptions(language, "en");
  await user.click(
    screen.getByRole("button", { name: locale === "ko" ? "이미지 해제" : "Clear image" }),
  );
  await user.click(screen.getByRole("button", { name: locale === "ko" ? "저장" : "Save" }));
  expect(received?.get("name")).toBe("새 이름");
  expect(received?.get("locale")).toBe("en");
  expect(received?.get("avatar")).toBe("");
  const message = locale === "ko" ? "내 정보를 저장했습니다." : "Profile saved.";
  expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
});
it("프로필 필드·폼 오류와 재시도 안내를 표시하고 편집 값을 유지한다", async () => {
  show(
    <ProfileForm
      profile={profile}
      permalink="/me"
      action={async (_state, data) => ({
        ok: false,
        formError: "파일을 확인하세요.",
        fieldErrors: { name: ["이름 오류"], locale: ["언어 오류"] },
        values: {
          name: String(data.get("name")),
          locale: String(data.get("locale")),
          avatar: String(data.get("avatar")),
        },
        retryAfter: 5,
      })}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("이름"));
  await user.type(screen.getByLabelText("이름"), "남길 이름");
  await user.selectOptions(screen.getByLabelText("언어"), "en");
  await user.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "파일을 확인하세요.");
  for (const label of ["이름", "언어"]) {
    const input = screen.getByLabelText(label);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toContain(
      "오류",
    );
  }
  expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("남길 이름");
  expect((screen.getByLabelText("언어") as HTMLSelectElement).value).toBe("en");
  expect(screen.getByText("5초 뒤에 다시 시도해 주세요.")).toBeTruthy();
});
it("프로필 제출 중 버튼을 막고 보이는 로딩 문구 없이 스피너를 표시한다", async () => {
  let finish!: (result: ProfileResult) => void;
  show(
    <ProfileForm
      profile={profile}
      permalink="/me"
      action={async () =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "저장" }));
  expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  await act(async () => finish({ ok: true, saved: true }));
});
it.each(["ko", "en"] as const)(
  "%s 비밀번호 폼은 현재·새 비밀번호를 제출하고 세션 안내를 표시한다",
  async (locale) => {
    let received: FormData | undefined;
    show(
      <PasswordChangeForm
        permalink={locale === "ko" ? "/me" : "/en/me"}
        action={async (_state, data) => {
          received = data;
          return { ok: true, changed: true };
        }}
      />,
      locale,
    );
    expect(
      screen.getByText(
        locale === "ko"
          ? "비밀번호를 바꾸면 다른 기기에서 로그아웃됩니다. 이 기기의 로그인은 유지됩니다."
          : "Changing your password signs out other devices. This device stays signed in.",
      ),
    ).toBeTruthy();
    const current = screen.getByLabelText(
      locale === "ko" ? "현재 비밀번호" : "Current password",
    ) as HTMLInputElement;
    const next = screen.getByLabelText(
      locale === "ko" ? "새 비밀번호" : "New password",
    ) as HTMLInputElement;
    expect([current.name, current.type, current.autocomplete, current.required]).toEqual([
      "currentPassword",
      "password",
      "current-password",
      true,
    ]);
    expect([next.name, next.type, next.autocomplete, next.minLength, next.maxLength]).toEqual([
      "newPassword",
      "password",
      "new-password",
      8,
      128,
    ]);
    const user = userEvent.setup();
    await user.type(current, "old-password");
    await user.type(next, "new-password");
    await user.click(
      screen.getByRole("button", { name: locale === "ko" ? "비밀번호 변경" : "Change password" }),
    );
    expect(received?.get("currentPassword")).toBe("old-password");
    expect(received?.get("newPassword")).toBe("new-password");
    const message =
      locale === "ko"
        ? "비밀번호를 변경했습니다. 다른 기기에서 로그아웃되었습니다."
        : "Password changed. Other devices have been signed out.";
    expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
    expect([current.value, next.value]).toEqual(["", ""]);
  },
);
it("비밀번호 제출 중 스피너와 입력칸 오류·재시도 안내를 표시한다", async () => {
  let finish!: (result: PasswordResult) => void;
  show(
    <PasswordChangeForm
      permalink="/me"
      action={async () =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("현재 비밀번호"), "wrong-password");
  await user.type(screen.getByLabelText("새 비밀번호"), "new-password");
  await user.click(screen.getByRole("button", { name: "비밀번호 변경" }));
  expect(
    (screen.getByRole("button", { name: "비밀번호 변경" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.getByRole("status").textContent).toBe("");
  await act(async () =>
    finish({
      ok: false,
      formError: "다시 시도",
      fieldErrors: { currentPassword: ["현재 비밀번호 오류"], newPassword: ["새 비밀번호 오류"] },
      retryAfter: 7,
    }),
  );
  expect(screen.getByRole("alert").textContent).toBe("다시 시도");
  for (const label of ["현재 비밀번호", "새 비밀번호"]) {
    const input = screen.getByLabelText(label);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toContain(
      "오류",
    );
  }
  expect(screen.getByText("7초 뒤에 다시 시도해 주세요.")).toBeTruthy();
});
