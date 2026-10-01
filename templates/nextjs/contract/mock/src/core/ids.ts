/**
 * 리소스 id(UUIDv7)와 UUID 입력 해석.
 *
 * - uuid7은 Python 3.14의 uuid.uuid7()과 같은 방식이다: 앞 48비트가 밀리초 시각이고, 같은 밀리초 안에서는
 *   42비트 카운터가 1씩 는다. 그래서 id 순서가 만든 순서와 같다(목록 정렬의 동점을 id로 가른다).
 * - parseUuid는 FastAPI(Pydantic)가 경로·필터의 uuid로 받는 표기를 받는다.
 * - parsePythonUuid는 FastAPI가 관계의 id(아바타 파일, 역할)를 읽는 uuid.UUID()와 같다. 더 너그럽다.
 */

import { randomBytes } from "node:crypto";

const COUNTER_MAX = 0x3ff_ffff_ffffn;
const VERSION_7 = 0x7000n << 64n;
const VARIANT_RFC_4122 = 0x8000n << 48n;

let lastTimestamp = -1;
let lastCounter = 0n;

function freshCounterAndTail(): [bigint, bigint] {
  const random = BigInt(`0x${randomBytes(10).toString("hex")}`);
  // 카운터의 맨 윗비트는 0이다. 같은 밀리초에 넘치지 않게 여유를 둔다.
  return [(random >> 32n) & 0x1ff_ffff_ffffn, random & 0xffff_ffffn];
}

/** 새 UUIDv7. 시각 순서로 커진다. */
export function uuid7(): string {
  let timestamp = Math.max(Date.now(), lastTimestamp);
  let counter: bigint;
  let tail: bigint;
  if (timestamp > lastTimestamp) {
    [counter, tail] = freshCounterAndTail();
  } else {
    counter = lastCounter + 1n;
    tail = BigInt(`0x${randomBytes(4).toString("hex")}`);
    if (counter > COUNTER_MAX) {
      timestamp += 1;
      [counter, tail] = freshCounterAndTail();
    }
  }
  lastTimestamp = timestamp;
  lastCounter = counter;
  const value =
    (BigInt(timestamp) << 80n) |
    VERSION_7 |
    ((counter >> 30n) << 64n) |
    VARIANT_RFC_4122 |
    ((counter & 0x3fff_ffffn) << 32n) |
    tail;
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SIMPLE = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i;
const HYPHENATED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URN_PREFIX = "urn:uuid:";

/** 하이픈 표기로 바꿀 값. 중괄호와 urn:uuid: 접두사를 떼고, 32자리 16진수에는 하이픈을 넣는다. */
function hyphenatedForm(value: string): string {
  if (value.startsWith("{") && value.endsWith("}")) return value.slice(1, -1);
  if (value.startsWith(URN_PREFIX)) return value.slice(URN_PREFIX.length);
  return value.replace(SIMPLE, "$1-$2-$3-$4-$5");
}

/**
 * UUID 입력을 표준 표기(소문자, 하이픈)로 바꾼다. 받지 않는 값이면 undefined다.
 * Pydantic과 같이 32자리 16진수, 하이픈 표기, 중괄호로 감싼 하이픈 표기, urn:uuid: 접두사를 받는다.
 */
export function parseUuid(value: string): string | undefined {
  const hyphenated = hyphenatedForm(value);
  return HYPHENATED.test(hyphenated) ? hyphenated.toLowerCase() : undefined;
}

/** Python이 int()에 넘기기 전에 공백으로 바꾸는 U+0080 이상의 공백 문자(str.isspace). */
const UNICODE_SPACE = /^[\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/u;
const DECIMAL_DIGIT = /^\p{Nd}$/u;
/** int(text, 16)이 받는 ASCII 문자열: 앞뒤 공백, +, 0x 접두사, 숫자 사이의 밑줄 하나. */
const PYTHON_HEX_INT = /^[\t-\r ]*\+?(?:0[xX]_?)?([0-9a-fA-F]+(?:_[0-9a-fA-F]+)*)[\t-\r ]*$/;

/** 유니코드 십진 숫자의 값. 십진 숫자는 늘 0부터 9까지 열 개씩 이어져 있어, 이어진 구간의 시작에서 센다. */
function decimalValue(code: number): number {
  let start = code;
  while (DECIMAL_DIGIT.test(String.fromCodePoint(start - 1))) start -= 1;
  return (code - start) % 10;
}

/** Python의 int()가 먼저 하는 변환: 유니코드 공백은 공백으로, 유니코드 십진 숫자는 ASCII 숫자로 바꾼다. */
function pythonIntText(text: string): string {
  let ascii = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x7f) ascii += char;
    else if (UNICODE_SPACE.test(char)) ascii += " ";
    else if (DECIMAL_DIGIT.test(char)) ascii += String(decimalValue(code));
    else return `${ascii}?`;
  }
  return ascii;
}

/**
 * Python의 uuid.UUID(문자열)처럼 읽어 표준 표기로 바꾼다. 받지 않는 값이면 undefined다.
 * urn:과 uuid:를 모두 지우고, 앞뒤 중괄호를 벗기고, 하이픈을 모두 지운 32글자를 int(…, 16)로 읽는다.
 * 그래서 하이픈 자리가 틀려도, 앞뒤 공백·+·0x·밑줄·유니코드 숫자가 있어도 받는다.
 */
export function parsePythonUuid(value: string): string | undefined {
  const hex = value
    .replaceAll("urn:", "")
    .replaceAll("uuid:", "")
    .replace(/^[{}]+|[{}]+$/g, "")
    .replaceAll("-", "");
  if (Array.from(hex).length !== 32) return undefined;
  const digits = PYTHON_HEX_INT.exec(pythonIntText(hex))?.[1];
  if (digits === undefined) return undefined;
  const int = BigInt(`0x${digits.replaceAll("_", "")}`);
  return int.toString(16).padStart(32, "0").replace(SIMPLE, "$1-$2-$3-$4-$5");
}
