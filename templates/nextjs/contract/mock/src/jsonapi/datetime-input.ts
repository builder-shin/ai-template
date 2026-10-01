/**
 * Pydantic(lax 모드)이 문자열을 AwareDatetime으로 읽는 규칙. FastAPI의 필터 모델(filter[createdFrom] 등)이
 * 쿼리 문자열을 이렇게 검증하고, 틀리면 첫 오류의 메시지를 detail로 쓴다. Pydantic은 speedate(Rust)로
 * 읽으므로 그 규칙을 옮겼다. 입력은 UTF-8 바이트로 본다.
 *
 * 1. RFC 3339 모양: YYYY-MM-DD, 구분자(T, t, _, 공백), HH:MM, 선택인 :SS와 소수(. 또는 ,, 여섯 자리
 *    뒤는 버린다), 선택인 시간대(Z, z, ±HH:MM, ±HHMM. 음수 부호는 U+2212도 받는다).
 * 2. 숫자는 Unix 시각(UTC)이다. 정수는 [+-]숫자이고, 정수로 읽다 소수점에서 멈추면 실수(지수 표기
 *    포함)로 읽는다. 절댓값이 2×10^10보다 크면 밀리초로 본다. speedate는 실수의 밀리초를 초로 바꾼 뒤 이
 *    규칙을 한 번 더 적용하고, i64로 넘친 정수가 양수로 돌아오면 그대로 쓴다. 그대로 옮겼다.
 * 3. 둘 다 아니면 문자열 전체를 날짜로 읽어 본 오류를 알린다(Pydantic의 datetime_from_date_parsing).
 *    날짜로 읽히면(YYYY-MM-DD) 시간대가 없는 시각이다.
 * 4. 시간대가 없으면 "Input should have timezone info"다. 0년은 speedate는 받지만 Python이 받지 않는다.
 */

import { type Instant, SECOND } from "../core/clock.ts";

const MS_WATERSHED = 20_000_000_000;
/** 0000-01-01T00:00:00Z, 0001-01-01T00:00:00Z, 10000-01-01T00:00:00Z의 Unix 시각(초). */
const UNIX_0000 = -62_167_219_200;
const UNIX_0001 = -62_135_596_800;
const UNIX_10000 = 253_402_300_800;
/** lexical-core(speedate가 실수를 읽는 크레이트)의 표준 형식. */
const DECIMAL = /^[+-]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const NAIVE = "Input should have timezone info";

const DASH = 0x2d;
const DOT = 0x2e;
const COLON = 0x3a;
const PLUS = 0x2b;
const DATE_TIME_SEPARATORS: ReadonlySet<number> = new Set([0x54, 0x74, 0x20, 0x5f]); // T t 공백 _
const FRACTION_SEPARATORS: ReadonlySet<number> = new Set([0x2e, 0x2c]); // . ,
const UTC_DESIGNATORS: ReadonlySet<number> = new Set([0x5a, 0x7a]); // Z z
/** U+2212(−)의 UTF-8 바이트. */
const MINUS_SIGN = [0xe2, 0x88, 0x92] as const;

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface Parsed {
  readonly instant: Instant;
  readonly aware: boolean;
  readonly yearZero: boolean;
}

/** start부터 count자리의 ASCII 숫자. 숫자가 아니거나 입력이 끝나면 undefined다. */
function digitsAt(bytes: Uint8Array, start: number, count: number): number | undefined {
  let value = 0;
  for (let index = start; index < start + count; index += 1) {
    const byte = bytes[index];
    if (byte === undefined || byte < 0x30 || byte > 0x39) return undefined;
    value = value * 10 + (byte - 0x30);
  }
  return value;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** speedate의 Date::parse_bytes_partial: 앞 10바이트의 YYYY-MM-DD. 틀리면 그 설명이다. */
function datePart(bytes: Uint8Array): CivilDate | string {
  if (bytes.length < 10) return "input is too short";
  const year = digitsAt(bytes, 0, 4);
  if (year === undefined) return "invalid character in year";
  if (bytes[4] !== DASH) return "invalid date separator, expected `-`";
  const month = digitsAt(bytes, 5, 2);
  if (month === undefined) return "invalid character in month";
  if (bytes[7] !== DASH) return "invalid date separator, expected `-`";
  const day = digitsAt(bytes, 8, 2);
  if (day === undefined) return "invalid character in day";
  if (month < 1 || month > 12) return "month value is outside expected range of 1-12";
  if (day < 1 || day > daysInMonth(year, month)) return "day value is outside expected range";
  return { year, month, day };
}

/** 1970-01-01부터의 날 수(Howard Hinnant의 days_from_civil). 0년과 그 전도 맞다. */
function epochDays({ year, month, day }: CivilDate): number {
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;
  const dayOfYear = Math.floor((153 * ((month + 9) % 12) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100);
  return era * 146_097 + dayOfEra + dayOfYear - 719_468;
}

/** 시간대(Z, ±HH[:]MM)의 초. 없으면 null이고, 틀렸거나 뒤에 글자가 남으면 undefined다. */
function zoneOffset(bytes: Uint8Array, position: number): number | null | undefined {
  const first = bytes[position];
  if (first === undefined) return null;
  if (UTC_DESIGNATORS.has(first)) return position + 1 === bytes.length ? 0 : undefined;
  let at = position + 1;
  let sign = -1;
  if (first === PLUS) sign = 1;
  else if (MINUS_SIGN.every((byte, index) => bytes[position + index] === byte)) at = position + 3;
  else if (first !== DASH) return undefined;
  const hours = digitsAt(bytes, at, 2);
  at += bytes[at + 2] === COLON ? 3 : 2;
  const minutes = digitsAt(bytes, at, 2);
  if (hours === undefined || minutes === undefined || hours > 23 || minutes > 59) return undefined;
  return at + 2 === bytes.length ? sign * (hours * 3600 + minutes * 60) : undefined;
}

/** speedate의 Time::parse_bytes_offset: start부터 HH:MM[:SS[.소수]][시간대]가 끝까지 맞아야 한다. */
function timePart(
  bytes: Uint8Array,
  start: number,
): { seconds: number; micro: number; offset: number | null } | undefined {
  const hour = digitsAt(bytes, start, 2);
  const minute = digitsAt(bytes, start + 3, 2);
  if (hour === undefined || minute === undefined || bytes[start + 2] !== COLON) return undefined;
  if (hour > 23 || minute > 59) return undefined;
  let position = start + 5;
  let second = 0;
  let micro = 0;
  if (bytes[position] === COLON) {
    const value = digitsAt(bytes, position + 1, 2);
    if (value === undefined || value > 59) return undefined;
    second = value;
    position += 3;
    if (FRACTION_SEPARATORS.has(bytes[position] ?? 0)) {
      position += 1;
      let count = 0;
      for (let digit = digitsAt(bytes, position, 1); digit !== undefined; count += 1) {
        if (count < 6) micro = micro * 10 + digit;
        position += 1;
        digit = digitsAt(bytes, position, 1);
      }
      if (count === 0) return undefined;
      micro *= 10 ** Math.max(6 - count, 0);
    }
  }
  const offset = zoneOffset(bytes, position);
  if (offset === undefined) return undefined;
  return { seconds: hour * 3600 + minute * 60 + second, micro, offset };
}

function rfc3339(bytes: Uint8Array): Parsed | undefined {
  const date = datePart(bytes);
  if (typeof date === "string" || !DATE_TIME_SEPARATORS.has(bytes[10] ?? 0)) return undefined;
  const time = timePart(bytes, 11);
  if (time === undefined) return undefined;
  const local = (epochDays(date) * 86_400 + time.seconds) * SECOND + time.micro;
  return {
    instant: local - (time.offset ?? 0) * SECOND,
    aware: time.offset !== null,
    yearZero: date.year === 0,
  };
}

/**
 * speedate의 정수 읽기(int_parse_bytes_internal): [+-]숫자를 i64로 곱하고 더한다. 값이 음수가 되면 넘친
 * 것으로 보고 멈추지만, 넘쳐도 양수로 돌아오면 그대로 쓴다. 멈추면 멈춘 바이트(빈 입력이면 없다)다.
 */
function readInteger(bytes: Uint8Array): { readonly value: bigint } | { readonly stop?: number } {
  if (bytes.length === 0) return {};
  const signed = bytes.length >= 2 && (bytes[0] === DASH || bytes[0] === PLUS);
  let value = 0n;
  for (let index = signed ? 1 : 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    if (byte < 0x30 || byte > 0x39) return { stop: byte };
    value = BigInt.asIntN(64, value * 10n + BigInt(byte - 0x30));
    if (value < 0n) return { stop: byte };
  }
  return { value: signed && bytes[0] === DASH ? -value : value };
}

/**
 * speedate의 DateTime::from_timestamp: 절댓값이 2×10^10보다 크면 밀리초다. 0년 1월 1일보다 이르거나
 * 10000년부터면 그 방향("before", "after")이다.
 */
function fromTimestamp(timestamp: bigint, micro: number): Parsed | "before" | "after" {
  let seconds = timestamp;
  let total = micro;
  if ((timestamp < 0n ? -timestamp : timestamp) > BigInt(MS_WATERSHED)) {
    const remainder = ((timestamp % 1000n) + 1000n) % 1000n;
    seconds = (timestamp - remainder) / 1000n;
    total += Number(remainder) * 1000;
  }
  seconds += BigInt(Math.floor(total / 1_000_000));
  total %= 1_000_000;
  if (seconds < BigInt(UNIX_0000)) return "before";
  if (seconds >= BigInt(UNIX_10000)) return "after";
  const whole = Number(seconds);
  return { instant: whole * SECOND + total, aware: true, yearZero: whole < UNIX_0001 };
}

/** 숫자로 쓴 Unix 시각(speedate의 float_parse_bytes). 숫자가 아니거나 범위를 벗어나면 undefined다. */
function unixTime(bytes: Uint8Array, text: string): Parsed | undefined {
  const integer = readInteger(bytes);
  let parsed: Parsed | "before" | "after";
  if ("value" in integer) {
    parsed = fromTimestamp(integer.value, 0);
  } else {
    const value = integer.stop === DOT && DECIMAL.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(value)) return undefined;
    const normalized = Math.abs(value) > MS_WATERSHED ? value / 1000 : value;
    const seconds = Math.floor(normalized);
    parsed = fromTimestamp(BigInt(seconds), Math.round((normalized - seconds) * 1_000_000));
  }
  return typeof parsed === "string" ? undefined : parsed;
}

/** 시각으로 읽지 못한 문자열을 날짜로 읽어 본 오류(speedate의 Date::parse_bytes). 날짜면 undefined다. */
function dateProblem(bytes: Uint8Array): string | undefined {
  const date = datePart(bytes);
  if (typeof date !== "string") {
    return bytes.length > 10 ? "unexpected extra characters at the end of the input" : undefined;
  }
  const integer = readInteger(bytes);
  const range = "value" in integer ? fromTimestamp(integer.value, 0) : undefined;
  if (range === "before") return "dates before 0000 are not supported as unix timestamps";
  if (range === "after") return "dates after 9999 are not supported as unix timestamps";
  return date;
}

/** 문자열을 시간대가 있는 시각으로 읽는다. 틀리면 Pydantic과 같은 메시지다. */
export function parseAwareDatetime(
  raw: string,
): { readonly value: Instant } | { readonly problem: string } {
  const bytes = Buffer.from(raw, "utf8");
  const parsed = rfc3339(bytes) ?? unixTime(bytes, raw);
  if (parsed === undefined) {
    const problem = dateProblem(bytes);
    return {
      problem:
        problem === undefined ? NAIVE : `Input should be a valid datetime or date, ${problem}`,
    };
  }
  if (!parsed.aware) return { problem: NAIVE };
  if (parsed.yearZero)
    return { problem: "Input should be a valid datetime, year 0 is out of range" };
  return { value: parsed.instant };
}
