import * as ImagePicker from "expo-image-picker";
import { pickImage } from "./picker";
import { errorKey } from "../forms/errors";
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
jest.mock("expo-file-system", () => ({
  File: class {
    size = 16;
    type = "image/png";
    name = "picked.png";
    exists = true;
  },
}));
test("cancelled image picking returns null without requesting broad library access", async () => {
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: true, assets: null });
  expect(await pickImage()).toBeNull();
  expect(ImagePicker.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
});
test("permission errors are sanitized and have an actionable message key", async () => {
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockRejectedValue({ code: "ERR_MISSING_PERMISSION", message: "private device path" });
  await expect(pickImage()).rejects.toMatchObject({ key: "photoPermission" });
});
test("a selected image has validated local metadata, with size/name fallback", async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///cache/picked.png", width: 1, height: 1 }],
  });
  expect(await pickImage()).toEqual({
    uri: "file:///cache/picked.png",
    name: "picked.png",
    mimeType: "image/png",
    size: 16,
  });
});
test("unsupported or remote URI metadata is rejected rather than read", async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: "https://private.example/file.png", width: 1, height: 1 }],
  });
  try {
    await pickImage();
    throw new Error("Expected rejection");
  } catch (error) {
    expect(errorKey(error)).toBe("invalidImage");
  }
});
