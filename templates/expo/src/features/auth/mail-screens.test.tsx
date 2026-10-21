import { render, screen, userEvent } from "@testing-library/react-native";
import { ResetForm, EmailRequestForm } from "./reset-screen";
import { VerificationForm } from "./verify-screen";
import { ApiError } from "../../lib/api/errors";
import i18n from "../../lib/i18n";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
test("mail request retry retains the safe email and handles throttling", async () => {
  const request = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(429, [{ code: "rate_limit.exceeded" }]))
    .mockResolvedValue(undefined);
  await render(<EmailRequestForm kind="reset" request={request} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "safe@example.com");
  await user.press(screen.getByRole("button", { name: "Send reset email" }));
  expect(await screen.findByText("Too many requests. Wait and retry.")).toBeTruthy();
  expect(screen.getByDisplayValue("safe@example.com")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Send reset email" }));
  expect(
    await screen.findByText("If the account is eligible, an email has been sent."),
  ).toBeTruthy();
});
test("reset clears its password after an expired-link failure and on completion", async () => {
  const reset = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(422, [{ code: "auth.verification_token_invalid" }]))
    .mockResolvedValue(undefined);
  await render(<ResetForm token="test-token" reset={reset} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Password"), "valid-password"); // betterleaks:allow test password
  await user.press(screen.getByRole("button", { name: "Reset password" }));
  expect(await screen.findByText(/This link is invalid/)).toBeTruthy();
  expect(screen.getByLabelText("Password").props.value).toBe("");
  await user.type(screen.getByLabelText("Password"), "changed-password"); // betterleaks:allow test password
  await user.press(screen.getByRole("button", { name: "Reset password" }));
  expect(await screen.findByText("Your password was reset. Sign in again.")).toBeTruthy();
  expect(screen.getByLabelText("Password").props.value).toBe("");
});
test("verification permits retry on failure but cannot consume a successful link twice", async () => {
  const verify = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(422, [{ code: "auth.verification_token_invalid" }]))
    .mockResolvedValue(undefined);
  await render(<VerificationForm token="test-token" verify={verify} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByText(/This link is invalid/)).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Verify email" }));
  expect(await screen.findByText("Your email is verified. You can sign in.")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Verify email" }));
  expect(verify).toHaveBeenCalledTimes(2);
});
