// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { PasswordResetRequestForm, PasswordResetForm } from "./password-reset-form";
import type { AuthAction, AuthResult } from "./state";

afterEach(cleanup);
function show(children: React.ReactNode, locale: "ko" | "en" = "ko") {
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
const complete: AuthAction = async () => ({ ok: true });
function request(action: AuthAction = complete) {
  return <PasswordResetRequestForm requestAction={action} permalink="/forgot-password" />;
}
function reset(action: AuthAction = complete, token = "mail-token") {
  return (
    <PasswordResetForm
      token={token}
      resetAction={action}
      permalink="/reset-password?token=mail-token"
    />
  );
}
async function submitRequest() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("이메일"), "user@example.com");
  await user.click(screen.getByRole("button", { name: "재설정 메일 보내기" }));
}
async function submitReset() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("새 비밀번호"), "sample-password");
  await user.click(screen.getByRole("button", { name: "비밀번호 재설정" }));
}

it.each(["ko", "en"] as const)(
  "%s 요청은 이메일만 입력하고 계정 여부를 밝히지 않는 안내와 로그인 링크를 보여 준다",
  async (locale) => {
    show(request(), locale);
    const input = screen.getByLabelText(locale === "ko" ? "이메일" : "Email") as HTMLInputElement;
    expect([input.name, input.type, input.required, input.autocomplete]).toEqual([
      "email",
      "email",
      true,
      "email",
    ]);
    await userEvent.setup().type(input, "user@example.com");
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: locale === "ko" ? "재설정 메일 보내기" : "Send reset email",
      }),
    );
    const message =
      locale === "ko"
        ? "입력한 이메일의 계정이 있다면 비밀번호 재설정 메일을 보냈습니다. 받은 편지함을 확인해 주세요."
        : "If an account exists for that email, we sent a password reset link. Check your inbox.";
    expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
    expect(screen.queryByLabelText(locale === "ko" ? "이메일" : "Email")).toBeNull();
    expect(screen.getByRole("link", { name: locale === "ko" ? "로그인" : "Log in" })).toBeTruthy();
  },
);

it("요청 중 버튼을 막고 스피너만 더하며 429와 이메일 오류를 연결한다", async () => {
  let finish!: (state: AuthResult) => void;
  show(
    request(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await submitRequest();
  const button = screen.getByRole("button", { name: "재설정 메일 보내기" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("재설정 메일 보내기");
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  await act(async () =>
    finish({
      ok: false,
      formError: "요청이 많습니다",
      fieldErrors: { email: ["주소 확인"] },
      email: "user@example.com",
      retryAfter: 15,
    }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "요청이 많습니다");
  expect(screen.getByText("15초 뒤에 다시 시도해 주세요.")).toBeTruthy();
  const input = screen.getByLabelText("이메일");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
    "주소 확인",
  );
});

it.each(["ko", "en"] as const)(
  "%s 재설정은 메일 토큰·새 비밀번호를 보내고 성공 뒤 로그인할 수 있다",
  async (locale) => {
    let received: FormData | undefined;
    show(
      reset(async (_state, data) => {
        received = data;
        return { ok: true };
      }),
      locale,
    );
    const input = screen.getByLabelText(
      locale === "ko" ? "새 비밀번호" : "New password",
    ) as HTMLInputElement;
    expect([input.name, input.type, input.required, input.autocomplete]).toEqual([
      "password",
      "password",
      true,
      "new-password",
    ]);
    await userEvent.setup().type(input, "sample-password");
    await userEvent.setup().click(
      screen.getByRole("button", {
        name: locale === "ko" ? "비밀번호 재설정" : "Reset password",
      }),
    );
    const message =
      locale === "ko"
        ? "비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요."
        : "Your password has been reset. Log in with your new password.";
    expect((await screen.findByText(message)).getAttribute("role")).toBe("status");
    expect(received?.get("token")).toBe("mail-token");
    expect(received?.get("password")).toBe("sample-password");
    expect(screen.queryByLabelText(locale === "ko" ? "새 비밀번호" : "New password")).toBeNull();
    expect(screen.getByRole("link", { name: locale === "ko" ? "로그인" : "Log in" })).toBeTruthy();
  },
);

it("재설정 pending·실패는 스피너·폼 안내·연결한 비밀번호 오류를 표시하고 비밀번호를 복원하지 않는다", async () => {
  let finish!: (state: AuthResult) => void;
  show(
    reset(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await submitReset();
  const button = screen.getByRole("button", { name: "비밀번호 재설정" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("비밀번호 재설정");
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  await act(async () =>
    finish({ ok: false, formError: "링크 확인", fieldErrors: { password: ["길이 확인"] } }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "링크 확인");
  const input = screen.getByLabelText("새 비밀번호");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
    "길이 확인",
  );
  expect(input).toHaveProperty("value", "");
});

it("토큰 누락은 제출 없이 번역한 오류와 새 메일 요청 링크를 보여 준다", () => {
  show(reset(complete, ""));
  expect(screen.getByRole("alert").textContent).toBe("인증 링크가 올바르지 않거나 만료되었습니다.");
  expect(screen.queryByRole("button", { name: "비밀번호 재설정" })).toBeNull();
  expect(screen.getByRole("link", { name: "재설정 메일 요청" }).getAttribute("href")).toBe(
    "/forgot-password",
  );
});
