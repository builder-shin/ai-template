/**
 * 짝 없는 서로게이트(U+D800–U+DFFF 가운데 짝을 이루지 않은 코드 유닛). FastAPI 템플릿이 요청 본문의
 * 짝 없는 서로게이트를 다루는 방식을 목에서 똑같이 낸다.
 *
 * - 본문: Python의 json.loads는 바이트를 surrogatepass로 읽는다. JSON 이스케이프(\ud800)와 UTF-8로
 *   인코딩한 서로게이트 바이트(ED A0 80)가 모두 짝 없는 서로게이트가 된다(decodeBody).
 * - 검증: Pydantic은 값을 파싱하는 문자열(길이·패턴 제약이 있는 문자열, 선택지(enum, Literal), 날짜·UUID)에
 *   짝 없는 서로게이트가 있으면 다른 검사보다 먼저 string_unicode 오류(UNICODE_MESSAGE)를 낸다. 제약을
 *   검증기로 보는 역할 설명도 같다. 제약 없는 문자열(토큰, 비밀번호, id 등)은 그대로 받는다. 계약에서
 *   그런 문자열 스키마에 WELL_FORMED 키워드를 붙여 Ajv가 본다(contract-schemas.ts). 상태와 코드는 다른
 *   오류와 같은 규칙이다: /data/type이면 400 jsonapi.invalid_document, 필드면 422
 *   validation.invalid_format.
 * - 메시지: Pydantic이 오류 메시지에 넣는 입력 값(판별자 값)은 짝 없는 서로게이트 하나가 U+FFFD 셋이
 *   된다(lossy).
 * - 이메일: email-validator는 짝 없는 서로게이트를 안전하지 않은 글자로 알린다(loneSurrogateNames).
 *
 * 맞추지 않는 차이: UTF-8로 인코딩한 서로게이트 바이트 둘이 짝을 이루면(CESU-8) Python에서는 짝 없는
 * 서로게이트 둘이지만 JavaScript 문자열에서는 글자 하나가 된다. 브라우저(fetch, JSON.stringify)는 이런
 * 바이트를 보내지 않는다.
 */

import { isRecord } from "../json.ts";

/** Pydantic이 짝 없는 서로게이트가 든 문자열을 파싱하지 못할 때의 메시지(string_unicode). */
export const UNICODE_MESSAGE =
  "Input should be a valid string, unable to parse raw data as a unicode string";

/** 계약의 문자열 스키마에 붙이는 Ajv 키워드. 값에 짝 없는 서로게이트가 없어야 한다. */
export const WELL_FORMED = "wellFormed";

/** Pydantic이 파싱하는 문자열의 제약 키워드와 형식. */
const PARSING_KEYWORDS = ["minLength", "maxLength", "pattern", "enum", "const"];
const PARSING_FORMATS: ReadonlySet<unknown> = new Set(["date-time", "date", "time", "uuid"]);

/** u 플래그에서 \p{Cs}는 짝 없는 서로게이트에만 맞는다(짝을 이룬 둘은 코드 포인트 하나다). */
const LONE_SURROGATE = /\p{Cs}/gu;

const UTF8 = new TextDecoder("utf-8", { fatal: true });
/** 본문 중간의 조각을 읽는 디코더. 조각 맨 앞의 U+FEFF를 BOM으로 보고 지우지 않는다. */
const UTF8_INNER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function constrained(schema: Readonly<Record<string, unknown>>): boolean {
  return (
    PARSING_KEYWORDS.some((keyword) => keyword in schema) || PARSING_FORMATS.has(schema.format)
  );
}

/**
 * Pydantic이 값을 파싱하는 문자열 스키마인가(WELL_FORMED를 붙일 스키마). 제약이나 형식이 있는 문자열
 * 스키마이고, 널 허용 문자열의 제약을 anyOf 밖에 둔 스키마(역할 설명: anyOf [string, null]과 바깥의
 * maxLength)도 그렇다. 후자는 FastAPI가 검증기로 제약을 보면서 짝 없는 서로게이트를 길이보다 먼저
 * 거절한다(roles/schemas.py). WELL_FORMED는 문자열 값에만 걸리므로 null은 그대로 받는다.
 */
export function parsesString(schema: Readonly<Record<string, unknown>>): boolean {
  if (schema.type === "string") return constrained(schema);
  const branches = schema.anyOf;
  return (
    Array.isArray(branches) &&
    branches.some((branch) => isRecord(branch) && branch.type === "string") &&
    constrained(schema)
  );
}

/** Pydantic(pydantic-core)이 메시지에 넣는 모양: 짝 없는 서로게이트 하나가 U+FFFD 셋이 된다. */
export function lossy(text: string): string {
  return text.replace(LONE_SURROGATE, "\ufffd\ufffd\ufffd");
}

/** 짝 없는 서로게이트들을 email-validator가 알리는 모양(U+D800)으로. 겹치지 않고 정렬돼 있다. */
export function loneSurrogateNames(text: string): string[] {
  const names = new Set<string>();
  for (const [char] of text.matchAll(LONE_SURROGATE)) {
    names.add(`U+${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  return [...names].sort();
}

/** bytes[index]부터가 UTF-8로 인코딩한 서로게이트(ED A0..BF 80..BF)면 그 코드 유닛, 아니면 undefined다. */
function encodedSurrogateAt(bytes: Uint8Array, index: number): number | undefined {
  const [first, second = 0, third = 0] = bytes.subarray(index, index + 3);
  if (first !== 0xed || second < 0xa0 || second > 0xbf || third < 0x80 || third > 0xbf) {
    return undefined;
  }
  return 0xd000 | ((second & 0x3f) << 6) | (third & 0x3f);
}

/**
 * 본문 바이트를 Python의 bytes.decode("utf-8", "surrogatepass")처럼 읽는다. 앞의 BOM은 지운다(json.loads의
 * utf-8-sig). 그 밖의 잘못된 UTF-8이 있으면 TypeError를 던진다.
 */
export function decodeBody(bytes: Uint8Array): string {
  let text = "";
  let start = 0;
  for (let index = bytes.indexOf(0xed); index !== -1; index = bytes.indexOf(0xed, index + 1)) {
    const unit = encodedSurrogateAt(bytes, index);
    if (unit === undefined) continue;
    text += (start === 0 ? UTF8 : UTF8_INNER).decode(bytes.subarray(start, index));
    text += String.fromCharCode(unit);
    start = index + 3;
  }
  return text + (start === 0 ? UTF8 : UTF8_INNER).decode(bytes.subarray(start));
}
