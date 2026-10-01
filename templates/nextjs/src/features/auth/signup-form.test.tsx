// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import { SignupForm } from "./signup-form";
import { VerificationForm } from "./verification-form";
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
function signup(
  action: AuthAction,
  resend: AuthAction = async () => ({ ok: true, verificationEmail: "user@example.com" }),
) {
  return <SignupForm signupAction={action} resendAction={resend} permalink="/signup" />;
}
async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("이름"), "User");
  await user.type(screen.getByLabelText("이메일"), "user@example.com");
  await user.type(screen.getByLabelText("비밀번호"), "sample-password");
  await user.click(screen.getByRole("button", { name: "가입" }));
}
it.each(["ko", "en"] as const)(
  "%s 가입 폼은 이름·이메일·새 비밀번호와 로그인 링크를 제공한다",
  (locale) => {
    show(
      signup(async () => ({ ok: true })),
      locale,
    );
    const inputs = ["name", "email", "password"].map((name) =>
      document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!,
    );
    expect(inputs.map((input) => [input.name, input.required, input.autocomplete])).toEqual([
      ["name", true, "name"],
      ["email", true, "email"],
      ["password", true, "new-password"],
    ]);
    expect(screen.getByRole("link", { name: locale === "ko" ? "로그인" : "Log in" })).toBeTruthy();
  },
);
it("가입 중 버튼을 막고 스피너만 더한 뒤 메일 안내·재발송 화면으로 전환한다", async () => {
  let finish!: (state: AuthResult) => void;
  show(
    signup(
      async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    ),
  );
  await submit();
  const button = screen.getByRole("button", { name: "가입" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe("가입");
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  await act(async () => finish({ ok: true, verificationEmail: "user@example.com" }));
  expect(screen.queryByLabelText("비밀번호")).toBeNull();
  expect(screen.getByText("인증 메일을 보냈습니다. 받은 편지함을 확인해 주세요.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "인증 메일 재발송" })).toBeTruthy();
});
it("가입 오류를 세 입력칸에 연결하고 비밀번호를 복원하지 않는다", async () => {
  show(
    signup(async () => ({
      ok: false,
      formError: "가입 실패",
      fieldErrors: { name: ["이름 확인"], email: ["주소 확인"], password: ["길이 확인"] },
      name: "User",
      email: "user@example.com",
    })),
  );
  await submit();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "가입 실패");
  for (const label of ["이름", "이메일", "비밀번호"]) {
    const input = screen.getByLabelText(label);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)).toBeTruthy();
  }
  expect(screen.getByLabelText("비밀번호")).toHaveProperty("value", "");
});
it("재발송은 가입 이메일을 보내고 pending·429 안내 후에도 메일 화면을 유지한다", async () => {
  let finish!: (state: AuthResult) => void;
  let email: FormDataEntryValue | null = null;
  show(
    signup(
      async () => ({ ok: true, verificationEmail: "user@example.com" }),
      async (_state, data) => {
        email = data.get("email");
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    ),
  );
  await submit();
  const button = screen.getByRole("button", { name: "인증 메일 재발송" }) as HTMLButtonElement;
  await userEvent.setup().click(button);
  expect(email).toBe("user@example.com");
  expect(button.disabled).toBe(true);
  expect(screen.getByRole("status", { name: "진행 중" })).toBeTruthy();
  await act(async () =>
    finish({
      ok: false,
      formError: "요청이 많습니다",
      fieldErrors: {},
      retryAfter: 15,
      verificationEmail: "user@example.com",
    }),
  );
  expect(await screen.findByText("15초 뒤에 다시 시도해 주세요.")).toBeTruthy();
  expect(screen.queryByLabelText("비밀번호")).toBeNull();
});
it.each(["ko", "en"] as const)(
  "%s 인증은 메일 토큰을 제출하고 성공·로그인 링크를 보여 준다",
  async (locale) => {
    let received: FormDataEntryValue | null = null;
    show(
      <VerificationForm
        token="mail-token"
        permalink="/verify-email?token=mail-token"
        verifyAction={async (_state, data) => {
          received = data.get("token");
          return { ok: true };
        }}
      />,
      locale,
    );
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: locale === "ko" ? "이메일 인증" : "Verify email" }),
      );
    expect(await screen.findByRole("status")).toHaveProperty(
      "textContent",
      locale === "ko"
        ? "이메일 인증을 마쳤습니다. 이제 로그인할 수 있습니다."
        : "Your email is verified. You can log in now.",
    );
    expect(received).toBe("mail-token");
    expect(screen.getByRole("link", { name: locale === "ko" ? "로그인" : "Log in" })).toBeTruthy();
  },
);
it("인증 실패는 폼 안내로 보이며 토큰 누락은 제출하지 않는다", async () => {
  const action: AuthAction = async () => ({
    ok: false,
    formError: "인증 링크를 확인해 주세요",
    fieldErrors: {},
  });
  const view = show(
    <VerificationForm token="bad" permalink="/verify-email?token=bad" verifyAction={action} />,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "이메일 인증" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "인증 링크를 확인해 주세요",
  );
  view.unmount();
  show(<VerificationForm token="" permalink="/verify-email" verifyAction={action} />);
  expect(screen.getByRole("alert").textContent).toBe("인증 링크가 올바르지 않거나 만료되었습니다.");
  expect(screen.queryByRole("button", { name: "이메일 인증" })).toBeNull();
});
