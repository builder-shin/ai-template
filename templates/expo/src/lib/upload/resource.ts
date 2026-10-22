import type { FileResource } from "./types";
import type { components } from "../api/generated/schema";
type Included =
  | FileResource
  | components["schemas"]["RoleResource"]
  | components["schemas"]["UserPublicResource"];
export function relatedFile(
  included: readonly Included[] | undefined,
  id: string | undefined,
): FileResource | null {
  return (
    included?.find((item): item is FileResource => item.type === "files" && item.id === id) ?? null
  );
}
export function downloadUrl(file: FileResource | null): string | null {
  const value = file?.meta?.downloadUrl,
    expires = file?.meta?.downloadUrlExpiresAt;
  if (
    !value ||
    !expires ||
    !Number.isFinite(Date.parse(expires)) ||
    Date.parse(expires) <= Date.now() ||
    file?.attributes.status !== "ready"
  )
    return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (__DEV__ || url.protocol === "https:")
      ? value
      : null;
  } catch {
    return null;
  }
}
