import "server-only";
import { ko } from "../i18n/catalogs";
import type { ScreenRecord } from "../../components/resource/types";

/** 이름 없는 사용자와 아직 include하지 않은 관계를 구분한다. */
export function recordLabel(
  record: ScreenRecord | undefined,
  name: string,
  fallback: string,
  unnamedUser = ko.layout.unnamedUser,
) {
  if (record?.type === "users" && name === "name" && record.attributes.name == null)
    return unnamedUser;
  return String(record?.attributes[name] ?? fallback);
}
