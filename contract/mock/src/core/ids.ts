/**
 * 리소스 id(UUIDv7)와 UUID 입력 해석.
 *
 * - uuid7은 Python 3.14의 uuid.uuid7()과 같은 방식이다: 앞 48비트가 밀리초 시각이고, 같은 밀리초 안에서는
 *   42비트 카운터가 1씩 는다. 그래서 id 순서가 만든 순서와 같다(목록 정렬의 동점을 id로 가른다).
 * - parseUuid는 FastAPI(Pydantic)가 경로·필터의 uuid로 받는 표기를 받는다.
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
