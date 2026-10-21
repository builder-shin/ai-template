import { render, screen, userEvent } from "@testing-library/react-native";
import i18n from "../../lib/i18n";
import { SignupForm } from "./signup-screen";
import { ApiError } from "../../lib/api/errors";

jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
test("native signup keeps email/name, clears passwords, and re-localizes an existing API error", async () => {
  const register = jest
    .fn()
    .mockRejectedValue(
      new ApiError(422, [
        { code: "validation.already_taken", source: { pointer: "/data/attributes/email" } },
      ]),
    );
  await render(<SignupForm register={register} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "taken@example.com");
  await user.type(screen.getByLabelText("Name"), "Native User");
  await user.type(screen.getByLabelText("Password"), "valid-password"); // betterleaks:allow test password
  await user.press(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("This value is already in use.")).toBeTruthy();
  expect(screen.getByDisplayValue("taken@example.com")).toBeTruthy();
  expect(screen.getByDisplayValue("Native User")).toBeTruthy();
  expect(screen.getByLabelText("Password").props.value).toBe("");
  await user.press(screen.getByRole("button", { name: "한국어" }));
  expect(await screen.findByText("이미 사용 중인 값입니다.")).toBeTruthy();
  await user.type(screen.getByLabelText("비밀번호"), "another-password"); // betterleaks:allow test password
  await user.press(screen.getByRole("button", { name: "회원가입" }));
  expect(register).toHaveBeenCalledTimes(2);
  expect(register.mock.calls[1][0]).toMatchObject({
    email: "taken@example.com",
    name: "Native User",
    locale: "ko",
  });
});
test("schema errors prevent HTTP and success offers verification without retaining passwords", async () => {
  const register = jest.fn().mockResolvedValue(undefined);
  await render(<SignupForm register={register} />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Create account" }));
  expect(register).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Name"), "New");
  await user.type(screen.getByLabelText("Password"), "valid-password"); // betterleaks:allow test password
  await user.press(screen.getByRole("button", { name: "Create account" }));
  expect(await screen.findByText("Check your email to verify your account.")).toBeTruthy();
  expect(screen.getByLabelText("Password").props.value).toBe("");
});
