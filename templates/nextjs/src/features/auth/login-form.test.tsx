// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { LoginForm } from "./login-form";
import type { AuthAction, AuthResult } from "./state";

afterEach(cleanup);
function show(
  action: (_state: AuthResult, data: FormData) => Promise<AuthResult>,
  locale: "ko" | "en" = "ko",
  resend: AuthAction = async (): Promise<AuthResult> => ({ ok: true }),
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ko" ? ko : en}
      timeZone="Asia/Seoul"
    >
      <LoginForm
        loginAction={action}
        resendAction={resend}
        permalink={locale === "ko" ? "/login" : "/en/login"}
      />
    </NextIntlClientProvider>,
  );
}
async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("이메일"), "user@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "sample-password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
}
it.each(["ko", "en"] as const)("%s 폼은 계약 이름과 HTML 검증·자동완성을 갖는다", (locale) => {
  show(async () => ({ ok: true }), locale);
  const email = screen.getByLabelText(locale === "ko" ? "이메일" : "Email") as HTMLInputElement;
  const password = screen.getByLabelText(
    locale === "ko" ? "비밀번호" : "Password",
  ) as HTMLInputElement;
  expect([email.name, email.type, email.required, email.autocomplete]).toEqual([
    "email",
    "email",
    true,
    "email",
  ]);
  expect([password.name, password.type, password.required, password.autocomplete]).toEqual([
    "password",
    "password",
    true,
    "current-password",
  ]);
  expect(screen.getByRole("button", { name: locale === "ko" ? "로그인" : "Log in" })).toBeTruthy();
});
it("제출 중 버튼을 막고 보이는 로딩 문구 없이 스피너를 보여 준다", async () => {
  let finish!: (result: AuthResult) => void;
  let received: FormData | undefined;
  show(async (_state, data) => {
    received = data;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await submit();
  const button = screen.getByRole("button", { name: "로그인" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("로그인");
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  expect(received?.get("email")).toBe("user@example.com");
  expect(received?.get("password")).toBe("sample-password");
  await act(async () => finish({ ok: true }));
  expect(button.disabled).toBe(false);
});
it("입력칸 오류를 입력과 연결하고 폼 오류를 별도로 알린다", async () => {
  show(async () => ({
    ok: false,
    formError: "자격증명을 확인하세요",
    fieldErrors: { email: ["이메일을 확인하세요"] },
  }));
  await submit();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "자격증명을 확인하세요");
  const email = screen.getByLabelText("이메일");
  expect(email.getAttribute("aria-invalid")).toBe("true");
  expect(document.getElementById(email.getAttribute("aria-describedby")!)?.textContent).toBe(
    "이메일을 확인하세요",
  );
  expect(screen.getByLabelText("비밀번호").getAttribute("aria-invalid")).not.toBe("true");
});
it("미인증 안내에서 제출한 이메일로 재발송하고 성공을 알린다", async () => {
  let recipient: FormDataEntryValue | null = null;
  show(
    async () => ({
      ok: false,
      formError: "이메일 인증이 필요합니다",
      fieldErrors: {},
      verificationEmail: "user@example.com",
    }),
    "ko",
    async (_state, data) => {
      recipient = data.get("email");
      return { ok: true, verificationEmail: String(recipient) };
    },
  );
  await submit();
  const resend = await screen.findByRole("button", { name: "인증 메일 재발송" });
  expect(screen.getByText("받은 메일에서 인증 링크를 눌러 주세요.")).toBeTruthy();
  await userEvent.setup().click(resend);
  expect(
    await screen.findByText("인증 메일을 보냈습니다. 받은 편지함을 확인해 주세요."),
  ).toBeTruthy();
  expect(recipient).toBe("user@example.com");
});
it("재발송 실패와 Retry-After 안내를 보여 준다", async () => {
  show(
    async () => ({
      ok: false,
      formError: "인증 필요",
      fieldErrors: {},
      verificationEmail: "user@example.com",
    }),
    "ko",
    async () => ({
      ok: false,
      formError: "요청이 많습니다",
      fieldErrors: {},
      retryAfter: 12,
      verificationEmail: "user@example.com",
    }),
  );
  await submit();
  await userEvent.setup().click(await screen.findByRole("button", { name: "인증 메일 재발송" }));
  expect(await screen.findByText("12초 뒤에 다시 시도해 주세요.")).toBeTruthy();
  expect(screen.getByText("요청이 많습니다")).toBeTruthy();
});
it("다른 미인증 이메일로 로그인하면 이전 재발송 성공 안내를 지운다", async () => {
  show(
    async (_state, data) => ({
      ok: false,
      formError: "인증 필요",
      fieldErrors: {},
      verificationEmail: String(data.get("email")),
    }),
    "ko",
    async (_state, data) => ({ ok: true, verificationEmail: String(data.get("email")) }),
  );
  await submit();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "인증 메일 재발송" }));
  expect(
    await screen.findByText("인증 메일을 보냈습니다. 받은 편지함을 확인해 주세요."),
  ).toBeTruthy();
  await user.clear(screen.getByLabelText("이메일"));
  await user.type(screen.getByLabelText("이메일"), "other@example.com");
  await user.clear(screen.getByLabelText("비밀번호"));
  await user.type(screen.getByLabelText("비밀번호"), "sample-password");
  await user.click(screen.getByRole("button", { name: "로그인" }));
  expect(screen.queryByText("인증 메일을 보냈습니다. 받은 편지함을 확인해 주세요.")).toBeNull();
});
