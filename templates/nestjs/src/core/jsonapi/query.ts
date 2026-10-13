import type { z } from "zod";
import { ApiError } from "./errors.js";
import type { ErrorCode } from "./error-codes.js";
export interface QuerySpec {
  filters?: Readonly<Record<string, z.ZodType>>;
  sort?: readonly string[];
  defaultSort?: string;
  include?: readonly string[];
  fields?: Readonly<Record<string, readonly string[]>>;
  page?: { defaultSize: number; maxSize: number };
}
export interface ParsedQuery {
  filter: Record<string, unknown>;
  sort: readonly { field: string; descending: boolean }[];
  include: readonly string[];
  fields: Readonly<Record<string, readonly string[]>>;
  page: { number: number; size: number };
}
function invalid(parameter: string, code: ErrorCode = "jsonapi.invalid_query"): never {
  throw new ApiError({ status: 400, code, title: "Invalid query", source: { parameter } });
}
function list(value: string, parameter: string): string[] {
  if (!value) return [];
  const values = value.split(",");
  if (values.some((item) => !item)) invalid(parameter);
  return [...new Set(values)];
}
function parseSort(value: string, spec: QuerySpec): ParsedQuery["sort"] {
  return list(value, "sort").map((item) => {
    const descending = item.startsWith("-");
    const field = descending ? item.slice(1) : item;
    if (!spec.sort?.includes(field)) invalid("sort", "jsonapi.unsupported_sort");
    return { field, descending };
  });
}
export function parseQuery(rawSearch: string, spec: QuerySpec): ParsedQuery {
  const raw = new URLSearchParams(rawSearch);
  const seen = new Set<string>();
  for (const key of raw.keys()) {
    if (seen.has(key)) invalid(key);
    seen.add(key);
  }
  const filter: Record<string, unknown> = {};
  const fields: Record<string, readonly string[]> = {};
  let sort = parseSort(spec.defaultSort ?? "", spec);
  let include: readonly string[] = [];
  const page = { number: 1, size: spec.page?.defaultSize ?? 20 };
  for (const [key, value] of raw) {
    if (key === "include") {
      include = list(value, key);
      if (include.some((item) => !spec.include?.includes(item)))
        invalid(key, "jsonapi.unsupported_include");
    } else if (key === "sort") sort = parseSort(value, spec);
    else if (key === "page[number]" || key === "page[size]") {
      const number = Number(value);
      if (
        !spec.page ||
        !/^[0-9]+$/.test(value) ||
        !Number.isSafeInteger(number) ||
        number < 1 ||
        (key === "page[size]" && number > spec.page.maxSize)
      )
        invalid(key);
      if (key === "page[number]") page.number = number;
      else page.size = number;
    } else {
      const match = /^(filter|fields)\[([^\]]+)\]$/.exec(key);
      if (!match) invalid(key);
      const name = match[2] as string;
      if (match[1] === "filter") {
        const schema = Object.hasOwn(spec.filters ?? {}, name) ? spec.filters?.[name] : undefined;
        if (!schema) invalid(key);
        const parsed = schema.safeParse(value);
        if (!parsed.success) invalid(key);
        Object.defineProperty(filter, name, {
          value: parsed.data,
          enumerable: true,
          configurable: true,
        });
      } else {
        const allowed = Object.hasOwn(spec.fields ?? {}, name) ? spec.fields?.[name] : undefined;
        if (!allowed) invalid(key);
        const selected = list(value, key);
        if (selected.some((field) => !allowed.includes(field))) invalid(key);
        Object.defineProperty(fields, name, {
          value: selected,
          enumerable: true,
          configurable: true,
        });
      }
    }
  }
  return { filter, sort, include, fields, page };
}
