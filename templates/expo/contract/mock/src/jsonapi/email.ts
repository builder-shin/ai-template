/**
 * 이메일 규칙. FastAPI 템플릿은 이메일을 Pydantic EmailStr(email-validator)로 본다. 목은 계약의
 * `format: email`을 ajv-formats의 형식 검사로 보고, 개발하면서 만나기 쉬운 차이만 맞춘다.
 *
 * - 앞뒤 공백을 지운다(FastAPI의 Email은 strip한 뒤 EmailStr로 본다). 지우는 곳은 validation.ts다.
 * - 도메인을 소문자로 바꾼다(email-validator의 normalized 값).
 * - 특수 용도 도메인(test, local, localhost, invalid, onion, arpa와 그 하위 도메인)은 받지 않는다.
 * - 짝 없는 서로게이트는 email-validator처럼 안전하지 않은 글자로 알린다(@ 앞을 먼저 본다).
 *
 * 맞추지 않는 차이: 국제화 주소(한글 로컬 파트, IDN 도메인), `"이름 <주소>"` 꼴(Pydantic은 주소만
 * 꺼내 받는다), 길이 제한(로컬 파트 64자, 전체 254자). 이런 값은 목이 FastAPI와 다르게 판정할 수 있다.
 */

import { fullFormats } from "ajv-formats/dist/formats.js";
import { loneSurrogateNames } from "./surrogates.ts";

const SYNTAX = fullFormats.email;
/** email-validator의 SPECIAL_USE_DOMAIN_NAMES. */
const SPECIAL_USE_DOMAINS = ["arpa", "invalid", "local", "localhost", "onion", "test"];

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

function isSpecialUse(email: string): boolean {
  const domain = domainOf(email);
  return SPECIAL_USE_DOMAINS.some((name) => domain === name || domain.endsWith(`.${name}`));
}

/** Ajv의 email 형식 검사. ajv-formats의 형식에 특수 용도 도메인 거절을 더한다. */
export function isEmail(value: string): boolean {
  return SYNTAX instanceof RegExp && SYNTAX.test(value) && !isSpecialUse(value);
}

/** 도메인을 소문자로 바꾼 주소(email-validator의 normalized와 같다). 로컬 파트는 그대로 둔다. */
export function normalizeEmail(value: string): string {
  const at = value.lastIndexOf("@");
  return at === -1 ? value : `${value.slice(0, at + 1)}${value.slice(at + 1).toLowerCase()}`;
}

/** 짝 없는 서로게이트가 든 쪽(@ 앞, 그다음 @ 뒤)의 그 글자들. 없으면 undefined다. */
function unsafeCharacters(value: string): string[] | undefined {
  const at = value.indexOf("@");
  return [value.slice(0, at), value.slice(at + 1)]
    .map(loneSurrogateNames)
    .find((names) => names.length > 0);
}

/** 형식 오류의 이유. email-validator의 문구 가운데 흔한 것은 같은 순서로 같게 쓴다. */
export function emailProblem(value: unknown): string {
  if (typeof value !== "string") return "The email address is not valid.";
  if (!value.includes("@")) return "An email address must have an @-sign.";
  const unsafe = unsafeCharacters(value);
  if (unsafe !== undefined) {
    return `The email address contains unsafe characters: ${unsafe.join(", ")}.`;
  }
  if (!domainOf(value).includes(".")) {
    return "The part after the @-sign is not valid. It should have a period.";
  }
  if (isSpecialUse(value)) {
    return "The part after the @-sign is a special-use or reserved name that cannot be used with email.";
  }
  return "The email address is not valid.";
}
