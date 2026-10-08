/**
 * JSON:API 쿼리 파라미터의 파서. FastAPI 템플릿의 core/jsonapi/query.py와 operation.py의 쿼리 규칙과
 * 같다. 허용 목록은 계약의 operation 선언(operations.ts)에서 온다.
 *
 * - 모든 파서는 틀린 값을 400 ApiError로 거부하고 source.parameter에 파라미터 이름을 담는다.
 * - 순서: 모르는 파라미터 → include → fields → (컬렉션) page → sort → filter. 먼저 걸린 것만 알린다.
 * - 쿼리 문자열은 application/x-www-form-urlencoded 규칙으로 읽는다(+는 공백, %XX는 UTF-8).
 */

import type { Context } from "hono";
import type { AppEnv } from "../context.ts";
import { ApiError, type ErrorCode } from "./errors.ts";
import type { QuerySpec } from "./operations.ts";

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
/** int32 최댓값. 계약이 page[number]를 int32로 선언하므로 이 값까지만 받는다. */
const PAGE_NUMBER_MAX = 2_147_483_647;
const PAGE_DIGITS = /^[0-9]{1,10}$/;

/** 리소스 타입마다 남길 멤버 이름(sparse fieldset). */
export type FieldSets = ReadonlyMap<string, ReadonlySet<string>>;

export interface ResourceQuery {
  readonly include: readonly string[];
  readonly fields: FieldSets;
}

export interface Page {
  readonly number: number;
  readonly size: number;
}

export interface SortField {
  readonly name: string;
  readonly descending: boolean;
}

/** filter는 필터 이름 → 파서가 돌려준 값이다. 라우트는 파서의 값 타입(FilterValues)으로 받는다. */
export interface CollectionQuery<Filter = Readonly<Record<string, unknown>>> extends ResourceQuery {
  readonly page: Page;
  /** 비었으면 모듈의 기본 정렬이다. */
  readonly sort: readonly SortField[];
  /** 필터 이름 → 파서가 돌려준 값. 들어온 필터만 있다. */
  readonly filter: Filter;
}

/** filter[이름] 값 하나의 파서. 틀리면 problem이 에러 객체의 detail이 된다. */
export type FilterParser<Value = unknown> = (
  raw: string,
) => { readonly value: Value } | { readonly problem: string };
/** 필터 이름 → 파서. 계약의 filter 파라미터와 같은 이름, 같은 순서다. */
export type FilterParsers = Readonly<Record<string, FilterParser>>;
/** 파서들이 읽은 필터 값. 들어온 필터만 있다. */
export type FilterValues<Parsers extends FilterParsers> = {
  readonly [Name in keyof Parsers]?: Parsers[Name] extends FilterParser<infer Value>
    ? Value
    : never;
};

/** 요청의 쿼리 파라미터. */
export interface QueryParams {
  /** 파라미터 이름. 처음 나온 순서이고 겹치지 않는다. */
  readonly names: readonly string[];
  /** 받은 순서 그대로의 (이름, 값). */
  readonly pairs: readonly (readonly [string, string])[];
}

export function queryParams(c: Context<AppEnv>): QueryParams {
  const pairs = [...new URL(c.req.url).searchParams];
  return { names: [...new Set(pairs.map(([name]) => name))], pairs };
}

export function queryError(code: ErrorCode, parameter: string, detail: string): ApiError {
  return new ApiError(400, code, detail, { parameter });
}

function has(query: QueryParams, name: string): boolean {
  return query.names.includes(name);
}

/** 한 번만 온 파라미터의 값. 두 번 이상 오면 400이다. */
export function single(query: QueryParams, name: string): string {
  const values = query.pairs.filter(([key]) => key === name).map(([, value]) => value);
  if (values.length > 1) {
    throw queryError("jsonapi.invalid_query", name, `Query parameter ${name} must appear once.`);
  }
  return values[0] ?? "";
}

/** 쉼표로 나눈 값. 빈 항목(a,,b)은 400이다. */
function commaSeparated(query: QueryParams, name: string): string[] {
  const items = single(query, name)
    .split(",")
    .map((item) => item.trim());
  if (items.includes("")) {
    throw queryError("jsonapi.invalid_query", name, `${name} has an empty item.`);
  }
  return items;
}

function isFilterName(name: string): boolean {
  return name.startsWith("filter[") && name.endsWith("]");
}

function checkUnknown(query: QueryParams, spec: QuerySpec): void {
  const collection = spec.sort !== undefined;
  for (const name of query.names) {
    if (spec.names.has(name) || (collection && isFilterName(name))) continue;
    throw queryError("jsonapi.invalid_query", name, `Unknown query parameter ${name}.`);
  }
}

/** 반복된 경로는 처음 것만 남긴다. */
function parseInclude(query: QueryParams, allowed: readonly string[]): string[] {
  if (!has(query, "include")) return [];
  const paths = commaSeparated(query, "include");
  const unsupported = paths.find((path) => !allowed.includes(path));
  if (unsupported !== undefined) {
    const detail = `Cannot include ${unsupported}.`;
    throw queryError("jsonapi.unsupported_include", "include", detail);
  }
  return [...new Set(paths)];
}

/** 완전히 빈 값(fields[type]=)은 그 타입의 멤버를 모두 뺀다는 뜻이다(JSON:API 1.1). */
function parseFields(query: QueryParams, types: readonly string[]): FieldSets {
  const fields = new Map<string, ReadonlySet<string>>();
  for (const type of types) {
    const name = `fields[${type}]`;
    if (!has(query, name)) continue;
    fields.set(type, new Set(single(query, name) === "" ? [] : commaSeparated(query, name)));
  }
  return fields;
}

/** 1부터 maximum까지의 ASCII 숫자만 받는다. */
function positiveInt(query: QueryParams, name: string, fallback: number, maximum: number): number {
  if (!has(query, name)) return fallback;
  const raw = single(query, name);
  if (!PAGE_DIGITS.test(raw) || Number(raw) < 1 || Number(raw) > maximum) {
    const detail = `${name} must be between 1 and ${String(maximum)}.`;
    throw queryError("jsonapi.invalid_query", name, detail);
  }
  return Number(raw);
}

function parsePage(query: QueryParams): Page {
  return {
    number: positiveInt(query, "page[number]", 1, PAGE_NUMBER_MAX),
    size: positiveInt(query, "page[size]", PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX),
  };
}

/** sort=-createdAt,title. 같은 필드가 반복되면 처음 것만 남긴다. */
function parseSort(query: QueryParams, allowed: readonly string[]): SortField[] {
  if (!has(query, "sort")) return [];
  const fields = new Map<string, SortField>();
  for (const item of commaSeparated(query, "sort")) {
    const name = item.startsWith("-") ? item.slice(1) : item;
    if (!allowed.includes(name)) {
      throw queryError("jsonapi.unsupported_sort", "sort", `Cannot sort by ${name}.`);
    }
    if (!fields.has(name)) fields.set(name, { name, descending: item.startsWith("-") });
  }
  return [...fields.values()];
}

/**
 * filter[이름]. FastAPI의 필터 모델(extra="forbid")처럼 선언한 필터를 선언 순서로 먼저 검증하고,
 * 선언하지 않은 필터는 그다음에 들어온 순서로 거부한다. 먼저 나온 오류 하나만 알린다.
 */
function parseFilter(query: QueryParams, parsers: FilterParsers): Record<string, unknown> {
  const raw = new Map<string, string>();
  for (const name of query.names) {
    if (isFilterName(name)) raw.set(name.slice("filter[".length, -1), single(query, name));
  }
  const parsed: Record<string, unknown> = {};
  for (const [name, parse] of Object.entries(parsers)) {
    const value = raw.get(name);
    if (value === undefined) continue;
    const result = parse(value);
    if ("problem" in result) {
      throw queryError("jsonapi.invalid_query", `filter[${name}]`, result.problem);
    }
    parsed[name] = result.value;
  }
  const extra = [...raw.keys()].find((name) => !Object.hasOwn(parsers, name));
  if (extra !== undefined) {
    const detail = "Extra inputs are not permitted";
    throw queryError("jsonapi.invalid_query", `filter[${extra}]`, detail);
  }
  return parsed;
}

/** 단건·쓰기 operation의 쿼리(include, fields). */
export function parseResourceQuery(query: QueryParams, spec: QuerySpec): ResourceQuery {
  checkUnknown(query, spec);
  return { include: parseInclude(query, spec.include), fields: parseFields(query, spec.fields) };
}

/** 컬렉션 GET의 쿼리(include, fields, page, sort, filter). */
export function parseCollectionQuery(
  query: QueryParams,
  spec: QuerySpec,
  filters: FilterParsers,
): CollectionQuery {
  const resource = parseResourceQuery(query, spec);
  return {
    ...resource,
    page: parsePage(query),
    sort: parseSort(query, spec.sort ?? []),
    filter: parseFilter(query, filters),
  };
}
