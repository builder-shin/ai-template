/**
 * Pydantic의 검증 메시지. FastAPI 템플릿은 Pydantic 오류의 메시지를 에러 객체의 detail로 쓴다.
 * 목은 같은 요청에 같은 문구를 내도록 여기서 만든다(detail은 개발자용이라 클라이언트는 믿지 않는다).
 */

import { emailProblem } from "./email.ts";
import { lossy } from "./surrogates.ts";

/**
 * Python str() 모양(None, True, False). Pydantic 메시지가 입력 값을 이렇게 적는다. 문자열의 짝 없는
 * 서로게이트는 U+FFFD 셋이 된다(surrogates.ts의 lossy).
 */
export function pythonStr(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return lossy(value);
  return JSON.stringify(value);
}

/** Python repr 모양. 문자열은 작은따옴표로 감싼다. */
export function pythonRepr(value: unknown): string {
  return typeof value === "string" ? `'${value}'` : pythonStr(value);
}

/** 선택지 표기: 'a', 'b' or 'c'. 에러 객체의 meta.params.expected도 이 문자열이다. */
export function expectedText(values: readonly unknown[]): string {
  const shown = values.map(pythonRepr);
  const last = shown.pop() ?? "";
  return shown.length === 0 ? last : `${shown.join(", ")} or ${last}`;
}

/** "1 character", "8 characters". */
export function counted(amount: number, noun: string): string {
  return `${String(amount)} ${noun}${amount === 1 ? "" : "s"}`;
}

/** 판별자의 표기. Pydantic은 camelCase 별칭과 Python 필드 이름을 함께 적는다: 'grant_type' | 'grantType'. */
export function discriminatorNames(tag: string): string {
  const snake = tag.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  return snake === tag ? `'${tag}'` : `'${snake}' | '${tag}'`;
}

/**
 * 형이 틀린 값의 메시지. expected는 JSON Schema의 type이다. FastAPI의 정수(Int32·Int64)는 strict라
 * 문자열, 불리언, 소수가 모두 "Input should be a valid integer"다.
 */
export function typeMessage(expected: string): string {
  switch (expected) {
    case "object":
      return "Input should be a valid dictionary or object to extract fields from";
    case "array":
      return "Input should be a valid list";
    default:
      return `Input should be a valid ${expected}`;
  }
}

/** 형식(format)이 틀린 값의 메시지. */
export function formatMessage(format: string, value: unknown): string {
  if (format === "email") return `value is not a valid email address: ${emailProblem(value)}`;
  return `Input should be a valid ${format}`;
}
