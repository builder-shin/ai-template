/**
 * 컬렉션의 filter[...] 파서(query.ts의 FilterParser). FastAPI는 필터 모델(Pydantic, lax 모드)로 쿼리
 * 문자열을 검증하고 첫 오류의 메시지를 detail로 쓴다. 여기의 파서는 FastAPI가 받는 값을 받고, 틀린 값에는
 * 같은 메시지를 낸다.
 *
 * - textFilter(str): 무엇이든 받는다. 빈 값도 그대로 넘긴다(FastAPI의 검색은 빈 검색어를 무시한다).
 * - enumFilter(StrEnum): 값이 계약의 enum 값과 정확히 같아야 한다. 선택지는 계약에 적힌 순서다.
 * - uuidFilter(uuid.UUID): Pydantic이 받는 표기(parseUuid)를 표준 표기로 바꾼다. 틀리면 Pydantic이
 *   옮기는 uuid 크레이트(Rust)의 설명을 붙인다.
 */

import { parseUuid } from "../core/ids.ts";
import type { components } from "../generated/api.ts";
import { allowedValues, contractSchemas } from "./contract-schemas.ts";
import { expectedText } from "./pydantic-messages.ts";
import type { FilterParser } from "./query.ts";

type Schemas = components["schemas"];
/** 문자열 enum인 계약 스키마의 이름. 예: UserStatus */
export type EnumName = {
  [Name in keyof Schemas]: Schemas[Name] extends string ? Name : never;
}[keyof Schemas];

export const textFilter: FilterParser<string> = (raw) => ({ value: raw });

/** 계약의 enum 스키마(name)의 값만 받는다. */
export function enumFilter<Name extends EnumName>(name: Name): FilterParser<Schemas[Name]> {
  const schema = contractSchemas[name];
  const choices = allowedValues(schema).filter(
    // 계약에서 읽은 값이라 생성 타입(Schemas[Name])의 값과 같다.
    (value): value is Schemas[Name] => typeof value === "string",
  );
  if (choices.length === 0) throw new Error(`계약의 ${name}은 문자열 enum이 아니다.`);
  const problem = `Input should be ${expectedText(choices)}`;
  return (raw) => {
    const value = choices.find((choice) => choice === raw);
    return value === undefined ? { problem } : { value };
  };
}

export const uuidFilter: FilterParser<string> = (raw) => {
  const value = parseUuid(raw);
  if (value !== undefined) return { value };
  return { problem: `Input should be a valid UUID, ${uuidProblem(raw)}` };
};

const URN_PREFIX = "urn:uuid:";
/** 하이픈 표기의 앞 네 그룹이 시작하는 자리와 길이. 마지막 그룹은 24에서 시작하고 12자다. */
const GROUPS = [
  { start: 0, length: 8 },
  { start: 9, length: 4 },
  { start: 14, length: 4 },
  { start: 19, length: 4 },
] as const;
const LAST_GROUP_START = 24;
const HEX_DIGIT = /^[0-9a-fA-F]$/;

/**
 * 크레이트가 설명하는 문자열. 딱 38바이트인 {…}와 45바이트인 urn:uuid:…는 본문을 하이픈 표기로 읽다
 * 실패한 것이라, 크레이트가 감싼 것을 뗀 본문만 넘긴다. 그 밖은 입력 전체다.
 */
function described(raw: string): string {
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes === 38 && raw.startsWith("{") && raw.endsWith("}")) return raw.slice(1, -1);
  if (bytes === 45 && raw.startsWith(URN_PREFIX)) return raw.slice(URN_PREFIX.length);
  return raw;
}

/** 중괄호나 urn:uuid:를 뗀 본문과 뗀 길이. simple은 감싸지 않은 입력인가다. */
function uuidBody(input: string): { body: string; offset: number; simple: boolean } {
  if (input.length >= 2 && input.startsWith("{") && input.endsWith("}")) {
    return { body: input.slice(1, -1), offset: 1, simple: false };
  }
  if (input.startsWith(URN_PREFIX)) {
    return { body: input.slice(URN_PREFIX.length), offset: URN_PREFIX.length, simple: false };
  }
  return { body: input, offset: 0, simple: true };
}

/**
 * uuid 크레이트가 받지 않는 문자열의 설명(InvalidUuid::into_err). 위치(at)는 1부터 센 자리다. 크레이트는
 * 바이트로 세지만, 처음 나온 틀린 글자 앞은 모두 ASCII라 글자 수와 같다. 길이도 크레이트처럼 감싼 문자까지
 * 센다(여기까지 오면 모두 ASCII다).
 */
export function uuidProblem(raw: string): string {
  const input = described(raw);
  const { body, offset, simple } = uuidBody(input);
  const hyphens: number[] = [];
  let index = 0;
  for (const char of body) {
    if (char === "-") hyphens.push(index);
    else if (!HEX_DIGIT.test(char)) {
      return `invalid character: found \`${char}\` at ${String(index + offset + 1)}`;
    }
    index += 1;
  }
  if (hyphens.length === 0 && simple) {
    return `invalid length: expected length 32 for simple format, found ${String(input.length)}`;
  }
  if (hyphens.length !== 4) {
    return `invalid group count: expected 5, found ${String(hyphens.length + 1)}`;
  }
  for (const [group, { start, length }] of GROUPS.entries()) {
    const found = (hyphens[group] ?? 0) - start;
    if (found !== length) {
      return `invalid group length in group ${String(group)}: expected ${String(length)}, found ${String(found)}`;
    }
  }
  return `invalid group length in group 4: expected 12, found ${String(input.length - LAST_GROUP_START)}`;
}
