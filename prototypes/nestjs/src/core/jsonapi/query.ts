import type { QueryDeclaration } from "./operation.js";
import { ApiError } from "./errors.js";
export interface Page {
  number: number;
  size: number;
}
export type FieldSets = ReadonlyMap<string, ReadonlySet<string>>;
export interface ParsedQuery {
  include: readonly string[];
  fields: FieldSets;
  page: Page;
  sort: readonly { name: string; descending: boolean }[];
  filter: Readonly<Record<string, unknown>>;
  raw: URLSearchParams;
}
function fail(
  parameter: string,
  detail: string,
  code:
    | "jsonapi.invalid_query"
    | "jsonapi.unsupported_include"
    | "jsonapi.unsupported_sort" = "jsonapi.invalid_query",
): never {
  throw new ApiError(400, code, detail, { parameter });
}
export function single(raw: URLSearchParams, name: string): string {
  const values = raw.getAll(name);
  if (values.length > 1) fail(name, `Query parameter ${name} must appear once.`);
  return values[0] ?? "";
}
function comma(raw: URLSearchParams, name: string): string[] {
  const items = single(raw, name)
    .split(",")
    .map((v) => v.trim());
  if (items.includes("")) fail(name, `${name} has an empty item.`);
  return items;
}
function positive(raw: URLSearchParams, name: string, fallback: number, max: number): number {
  if (!raw.has(name)) return fallback;
  const v = single(raw, name);
  if (!/^[0-9]{1,10}$/.test(v) || Number(v) < 1 || Number(v) > max)
    fail(name, `${name} must be between 1 and ${String(max)}.`);
  return Number(v);
}
export function parseQuery(url: string, spec: QueryDeclaration = {}): ParsedQuery {
  const raw = new URL(url, "http://localhost").searchParams;
  const known = new Set([
    ...(spec.include?.length ? ["include"] : []),
    ...(spec.fields ?? []).map((t) => `fields[${t}]`),
    ...(spec.sort ? ["page[number]", "page[size]", "sort"] : []),
  ]);
  for (const name of new Set(raw.keys()))
    if (!known.has(name) && !(spec.sort && name.startsWith("filter[") && name.endsWith("]")))
      fail(name, `Unknown query parameter ${name}.`);
  const include = raw.has("include") ? comma(raw, "include") : [];
  for (const path of include)
    if (!spec.include?.includes(path))
      fail("include", `Cannot include ${path}.`, "jsonapi.unsupported_include");
  const fields = new Map<string, ReadonlySet<string>>();
  for (const t of spec.fields ?? []) {
    const n = `fields[${t}]`;
    if (raw.has(n)) fields.set(t, new Set(single(raw, n) === "" ? [] : comma(raw, n)));
  }
  const page = spec.sort
    ? {
        number: positive(raw, "page[number]", 1, 2_147_483_647),
        size: positive(raw, "page[size]", 20, 100),
      }
    : { number: 1, size: 20 };
  const sorts = new Map<string, { name: string; descending: boolean }>();
  if (raw.has("sort"))
    for (const v of comma(raw, "sort")) {
      const descending = v.startsWith("-");
      const name = descending ? v.slice(1) : v;
      if (!spec.sort?.includes(name))
        fail("sort", `Cannot sort by ${name}.`, "jsonapi.unsupported_sort");
      if (!sorts.has(name)) sorts.set(name, { name, descending });
    }
  const values = new Map<string, string>();
  for (const name of new Set(raw.keys()))
    if (name.startsWith("filter[") && name.endsWith("]"))
      values.set(name.slice(7, -1), single(raw, name));
  const filter: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(spec.filters ?? {})) {
    const v = values.get(name);
    if (v === undefined) continue;
    const parsed = schema.safeParse(v);
    if (!parsed.success)
      fail(`filter[${name}]`, parsed.error.issues[0]?.message ?? "Invalid filter.");
    filter[name] = parsed.data;
  }
  for (const name of values.keys())
    if (!Object.hasOwn(spec.filters ?? {}, name))
      fail(`filter[${name}]`, "Extra inputs are not permitted");
  return { include: [...new Set(include)], fields, page, sort: [...sorts.values()], filter, raw };
}
