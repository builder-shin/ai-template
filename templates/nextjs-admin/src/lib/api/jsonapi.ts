import "server-only";
import type { ApiPaths } from "./paths";
import type { components } from "./schema";

type Schemas = components["schemas"];
type Resource = Extract<Schemas[keyof Schemas], { type: string; id: string; attributes: object }>;
type IncludedDocument = { included?: readonly Resource[] };
type Included<D> = D extends { included?: readonly (infer R)[] } ? R : Resource;
type Identifier<T extends string> = { type: T; id: string };
type Linked<D, T extends string> = Extract<Included<D>, { type: T }>;

export function resolveIncluded<D extends IncludedDocument, T extends Resource["type"]>(
  document: D,
  identifier: Identifier<T> | null,
): Linked<D, T> | undefined {
  if (!identifier) return undefined;
  return document.included?.find(
    (resource) => resource.type === identifier.type && resource.id === identifier.id,
  ) as Linked<D, T> | undefined;
}

export function resolveRelationship<D extends IncludedDocument, T extends Resource["type"]>(
  document: D,
  data: readonly Identifier<T>[],
): (Linked<D, T> | undefined)[];
export function resolveRelationship<D extends IncludedDocument, T extends Resource["type"]>(
  document: D,
  data: Identifier<T> | null,
): Linked<D, T> | undefined;
export function resolveRelationship<D extends IncludedDocument, T extends Resource["type"]>(
  document: D,
  data: Identifier<T> | null | readonly Identifier<T>[],
): Linked<D, T> | undefined | (Linked<D, T> | undefined)[] {
  if (data === null) return undefined;
  if ("type" in data) return resolveIncluded(document, data);
  return data.map((identifier) => resolveIncluded(document, identifier));
}

type QueryFor<P extends keyof ApiPaths> = ApiPaths[P] extends {
  get: { parameters: { query?: infer Q } };
}
  ? NonNullable<Q>
  : never;
type Group<Q, Prefix extends string> =
  Extract<keyof Q, `${Prefix}[${string}]`> extends never
    ? never
    : { [K in keyof Q as K extends `${Prefix}[${infer Name}]` ? Name : never]?: Q[K] };
type List = string | readonly string[];
type QueryOptions<Q> = {
  filter?: Group<Q, "filter">;
  sort?: Q extends { sort?: string } ? List : never;
  include?: Q extends { include?: string } ? List : never;
  page?: Group<Q, "page">;
  fields?: Group<Q, "fields"> extends never ? never : { [K in keyof Group<Q, "fields">]?: List };
};

export function buildQuery<P extends keyof ApiPaths>(
  _path: P,
  options: QueryOptions<QueryFor<NoInfer<P>>>,
): QueryFor<P> {
  const query: Record<string, unknown> = {};
  for (const group of ["filter", "page", "fields"] as const) {
    for (const [name, value] of Object.entries(options[group] ?? {})) {
      if (value !== undefined)
        query[`${group}[${name}]`] = Array.isArray(value) ? value.join(",") : value;
    }
  }
  for (const name of ["sort", "include"] as const) {
    const value = options[name];
    if (value !== undefined) query[name] = typeof value === "string" ? value : value.join(",");
  }
  // 입력 그룹의 키와 값은 QueryFor로 제한했다. 출력에서 계약의 평탄한 키로 되돌린다.
  return query as QueryFor<P>;
}

export function serializeQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.toString();
}

export function pageLinks(document: { links: Schemas["PaginationLinks"] }) {
  return { previous: document.links.prev, next: document.links.next };
}
