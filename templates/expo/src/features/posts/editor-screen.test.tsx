import { render, screen, userEvent, fireEvent } from "@testing-library/react-native";
import { PostForm } from "./editor-screen";
import { ApiError } from "../../lib/api/errors";
import i18n from "../../lib/i18n";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
beforeEach(async () => {
  await i18n.changeLanguage("en");
});
test("native post submission preserves editable content after server conflict", async () => {
  const save = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(409, [{ code: "resource.conflict" }]))
    .mockResolvedValue(undefined);
  await render(<PostForm save={save} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Title"), "Native draft");
  await user.type(screen.getByLabelText("Body"), "Preserve this body");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("This item changed. Refresh and retry.")).toBeTruthy();
  expect(screen.getByDisplayValue("Native draft")).toBeTruthy();
  expect(screen.getByDisplayValue("Preserve this body")).toBeTruthy();
  await fireEvent(screen.getByRole("switch", { name: "Published" }), "valueChange", true);
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(save.mock.calls[1][0]).toMatchObject({
    attributes: { title: "Native draft", body: "Preserve this body", status: "published" },
  });
});
