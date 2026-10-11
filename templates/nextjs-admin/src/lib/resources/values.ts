import "server-only";
import type { AnyResource, FieldPresentation } from "./definition";
import type { ScreenRecord } from "../../components/resource/types";
import type { WriteValues } from "./contract";

export function presentation(resource: AnyResource, name: string): FieldPresentation {
  return (resource.fields as Record<string, FieldPresentation> | undefined)?.[name] ?? {};
}
export function filterPresentation(resource: AnyResource, name: string): FieldPresentation {
  const filter = (resource.list.filters as Record<string, unknown> | undefined)?.[
    `filter[${name}]`
  ];
  return typeof filter === "object" && filter !== null
    ? (filter as FieldPresentation)
    : presentation(resource, name);
}
export function fieldValue(record: ScreenRecord, name: string) {
  return name === "id"
    ? record.id
    : (record.relationships?.[name]?.data ?? record.attributes[name]);
}
export function parseResourceForm(resource: AnyResource, mode: "create" | "edit", data: FormData) {
  const form = resource[mode];
  if (!form) throw new Error("쓰기 화면 선언 없음 — 필드와 권한을 확인한다.");
  const values: Record<string, unknown> = {};
  const inputs: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(form.fields)) {
    const raw = data.get(name);
    if (raw === null && !data.has(`__present_${name}`)) continue;
    if (kind === "relation" || kind === "relation-many") {
      const target = presentation(resource, name).relation?.type;
      if (!target)
        throw new Error(
          `관계 대상 선언 없음 (${resource.type}.${name}) — fields의 relation.type을 선언한다.`,
        );
      const identifiers = data
        .getAll(name)
        .filter((item): item is string => typeof item === "string" && item !== "");
      values[name] =
        kind === "relation-many"
          ? identifiers.map((id) => ({ type: target, id }))
          : identifiers[0]
            ? { type: target, id: identifiers[0] }
            : null;
      inputs[name] = kind === "relation-many" ? identifiers : (identifiers[0] ?? "");
    } else if (kind === "enum-many") {
      values[name] = data
        .getAll(name)
        .filter((item): item is string => typeof item === "string" && item !== "");
      inputs[name] = values[name];
    } else {
      values[name] = kind === "boolean" ? raw === "true" : typeof raw === "string" ? raw : "";
      inputs[name] = values[name];
    }
  }
  return { values: values as WriteValues<AnyResource["type"], "create" | "edit">, inputs };
}
