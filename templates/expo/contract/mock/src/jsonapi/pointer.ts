/** RFC 6901 JSON Pointer. 요청 문서 전체는 ""이고, "/"는 이름이 빈 문자열인 멤버다. */

import { isRecord } from "../json.ts";

/** 이름 하나를 pointer 조각으로 바꾼다(~ → ~0, / → ~1). */
export function escapeSegment(name: string): string {
  return name.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** pointer를 이름 목록으로 나눈다. */
export function pointerSegments(pointer: string): string[] {
  if (pointer === "") return [];
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** 객체의 멤버나 배열의 원소 하나. 없으면 undefined다. */
export function childValue(node: unknown, segment: string): unknown {
  if (Array.isArray(node)) {
    return /^\d+$/.test(segment) ? (node as unknown[])[Number(segment)] : undefined;
  }
  return isRecord(node) && Object.hasOwn(node, segment) ? node[segment] : undefined;
}

/** 문서 안에서 pointer가 가리키는 값. 없으면 undefined다. */
export function valueAt(document: unknown, pointer: string): unknown {
  return pointerSegments(pointer).reduce<unknown>(childValue, document);
}
