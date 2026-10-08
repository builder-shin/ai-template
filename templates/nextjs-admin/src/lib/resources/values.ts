import "server-only";
import type { AnyResource, FieldPresentation } from "./definition";
import type { ScreenRecord } from "../../components/resource/types";

export function presentation(resource: AnyResource, name: string): FieldPresentation {
  return (resource.fields as Record<string, FieldPresentation> | undefined)?.[name] ?? {};
}
export function fieldValue(record: ScreenRecord, name: string) {
  return record.relationships?.[name]?.data ?? record.attributes[name];
}
