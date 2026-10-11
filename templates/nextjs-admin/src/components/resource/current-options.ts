import type { FieldPresentation } from "../../lib/resources/definition";
import type { Option, ScreenRecord } from "./types";
import { recordLabel } from "../../lib/resources/labels";

export function withCurrentOptions(
  options: readonly Option[],
  value: unknown,
  relation?: FieldPresentation["relation"],
  included: readonly ScreenRecord[] = [],
  unnamedUser?: string,
): Option[] {
  const result = [...options];
  // 현재 값만 보충한다. 포함한 관계 라벨을 쓰고 추가 API 요청은 하지 않는다.
  for (const id of Array.isArray(value) ? value : [value])
    if (typeof id === "string" && id && !result.some((option) => option.value === id)) {
      const record = included.find((record) => record.type === relation?.type && record.id === id);
      result.push({
        value: id,
        label: recordLabel(record, relation?.label ?? "", id, unnamedUser),
      });
    }
  return result;
}
