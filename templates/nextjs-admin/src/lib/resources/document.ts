import "server-only";
import type { WriteDocument, WriteValues } from "./contract";
import type { AnyResource } from "./definition";

export function buildResourceDocument<R extends AnyResource, M extends "create" | "edit">(
  resource: R,
  operation: M,
  values: WriteValues<NoInfer<R["type"]>, M>,
  id?: string,
): WriteDocument<R["type"], M> {
  const form = resource[operation];
  if (!form)
    throw new Error(
      `쓰기 화면 선언 없음 (${resource.type}/${operation}) — 필드와 권한을 선언한다.`,
    );
  if (operation === "edit" && !id) throw new Error("수정 id 없음 — 대상 리소스 id를 넘긴다.");
  const attributes: Record<string, unknown> = {};
  const relationships: Record<string, { data: unknown }> = {};
  for (const [key, kind] of Object.entries(form.fields)) {
    const value = (values as Record<string, unknown>)[key];
    if (!Object.hasOwn(values, key) || value === undefined) continue;
    if (kind === "relation" || kind === "relation-many") relationships[key] = { data: value };
    else attributes[key] = value;
  }
  // 필수 값의 검증은 API가 맡는다. 키와 값 타입은 WriteValues로 계약에 제한한다.
  return {
    data: {
      type: resource.type,
      ...(operation === "edit" ? { id } : {}),
      ...(Object.keys(attributes).length ? { attributes } : {}),
      ...(Object.keys(relationships).length ? { relationships } : {}),
    },
  } as WriteDocument<R["type"], M>;
}
