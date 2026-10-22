import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { DisplayError } from "../forms/errors";
import { validatePickedFile } from "./validate";
import type { PickedFile } from "./types";
export async function pickImage(): Promise<PickedFile | null> {
  try {
    // Image-only system pickers do not require preemptive access to the entire library.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 1,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset || !/^(?:file|content):\/\//.test(asset.uri)) throw new DisplayError("invalidImage");
    const local = new File(asset.uri);
    const file = {
      uri: asset.uri,
      name: asset.fileName ?? local.name,
      mimeType: asset.mimeType ?? local.type,
      size: asset.fileSize ?? local.size,
    };
    validatePickedFile(file);
    return file;
  } catch (error) {
    if (error instanceof DisplayError) throw error;
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    throw new DisplayError(
      ["ERR_MISSING_PERMISSION", "ERR_PERMISSION_DENIED", "EACCES"].includes(String(code))
        ? "photoPermission"
        : "invalidImage",
    );
  }
}
