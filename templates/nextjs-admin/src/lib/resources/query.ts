import "server-only";
import { buildQuery } from "../api/jsonapi";
import type { ListQuery } from "./contract";
import type { AnyResource } from "./definition";

export type ResourceSearchParams = Record<string, string | string[] | undefined>;

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function resourceQuery<R extends AnyResource>(
  resource: R,
  params: ResourceSearchParams,
): ListQuery<R["type"]> {
  const filter: Record<string, string> = {};
  for (const key of Object.keys(resource.list.filters ?? {})) {
    const value = scalar(params[key]);
    if (value !== undefined) filter[key.slice(7, -1)] = value;
  }
  const rawPage = scalar(params["page[number]"]);
  const number = rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(number) ? number : 1;
  const sort = scalar(params.sort);
  const allowed = resource.list.sort?.fields ?? [];
  const validSort = sort
    ?.split(",")
    .every((key) => allowed.some((field) => field === key.replace(/^-/, "")));
  const selectedSort = validSort ? sort : resource.list.sort?.default;
  // type으로 확인한 동적 경로만 이 경계에서 정적 JSON:API 헬퍼로 넘긴다.
  const build = buildQuery as unknown as (
    path: string,
    options: { filter: object; sort?: string; include?: readonly string[]; page: object },
  ) => ListQuery<R["type"]>;
  return build(`/${resource.type}`, {
    filter,
    page: { number: page, size: 20 },
    ...(selectedSort ? { sort: selectedSort } : {}),
    ...(resource.list.include?.length ? { include: resource.list.include } : {}),
  });
}
