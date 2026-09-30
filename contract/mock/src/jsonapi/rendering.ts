/**
 * 문서 → 응답. sparse fieldset, 페이지 링크, 포함 리소스를 공통 계층에서 처리한다(FastAPI 템플릿의
 * core/jsonapi/rendering.py).
 *
 * 핸들러는 계약의 문서 타입으로 문서를 만들고 render로 돌려준다.
 */

import type { Context } from "hono";
import type { AppEnv } from "../context.ts";
import type { components } from "../generated/api.ts";
import { isRecord } from "../json.ts";
import { jsonApiResponse } from "./media.ts";
import { type FieldSets, type Page, queryParams } from "./query.ts";

type PaginationLinks = components["schemas"]["PaginationLinks"];
type CollectionMeta = components["schemas"]["CollectionMeta"];

export interface RenderOptions {
  /** 응답 상태(기본 200). */
  readonly status?: number;
  /** 요청의 fields[type]. 있으면 그 타입의 리소스에 요청한 멤버만 남긴다. */
  readonly fields?: FieldSets;
}

function resourceObjects(content: Record<string, unknown>): Record<string, unknown>[] {
  const data = content.data;
  const included = content.included;
  const candidates = [
    ...(Array.isArray(data) ? (data as unknown[]) : [data]),
    ...(Array.isArray(included) ? (included as unknown[]) : []),
  ];
  return candidates.filter(isRecord);
}

/** sparse fieldset: 요청한 타입의 attributes와 relationships에서 요청한 멤버만 남긴다. */
function applySparseFieldsets(content: Record<string, unknown>, fields: FieldSets): void {
  for (const resource of resourceObjects(content)) {
    const wanted = fields.get(String(resource.type));
    if (wanted === undefined) continue;
    for (const member of ["attributes", "relationships"]) {
      const values = resource[member];
      if (!isRecord(values)) continue;
      resource[member] = Object.fromEntries(
        Object.entries(values).filter(([name]) => wanted.has(name)),
      );
    }
  }
}

/** 문서를 JSON:API 응답으로 만든다. fields가 있으면 sparse fieldset을 적용한다. */
export function render(document: object, options: RenderOptions = {}): Response {
  const { status = 200, fields } = options;
  if (fields === undefined || fields.size === 0) return jsonApiResponse(document, status);
  const content = structuredClone(document) as Record<string, unknown>;
  applySparseFieldsets(content, fields);
  return jsonApiResponse(content, status);
}

/** (type, id)가 같은 리소스는 처음 것만 남긴다. 순서는 처음 나온 순서다. */
export function uniqueResources<T extends { readonly type: string; readonly id: string }>(
  resources: Iterable<T>,
): T[] {
  const found = new Map<string, T>();
  for (const resource of resources) {
    const key = `${resource.type}\u0000${resource.id}`;
    if (!found.has(key)) found.set(key, resource);
  }
  return [...found.values()];
}

/**
 * 요청된 include 경로의 로더만 차례로 불러 포함 리소스를 모은다. 모듈은 include 경로마다 로더를
 * 넘긴다. include 경로는 계약의 x-jsonapi-include로 이미 검사했으므로 선언한 경로마다 로더가 있어야 한다.
 */
export function loadIncluded<T extends { readonly type: string; readonly id: string }>(
  include: readonly string[],
  loaders: Readonly<Record<string, () => readonly T[]>>,
): T[] {
  return uniqueResources(
    include.flatMap((path) => {
      const loader = loaders[path];
      if (loader === undefined) throw new Error(`include ${path}의 로더가 없다.`);
      return loader();
    }),
  );
}

/** Python의 quote_plus: 영숫자와 _.-~ 밖의 바이트는 %XX(대문자)로, 공백은 +로 쓴다. */
function quotePlus(value: string): string {
  let encoded = "";
  for (const byte of Buffer.from(value, "utf8")) {
    const char = String.fromCharCode(byte);
    if (/^[A-Za-z0-9_.~-]$/.test(char)) encoded += char;
    else if (byte === 0x20) encoded += "+";
    else encoded += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return encoded;
}

/**
 * 페이지 링크와 메타. 링크는 요청 경로 기준의 상대 경로다. page[number] 밖의 쿼리 파라미터는 받은
 * 순서대로 두고 page[number]를 맨 뒤에 붙인다. 결과가 없어도 first와 last는 1쪽이다.
 */
export function pagination(
  c: Context<AppEnv>,
  page: Page,
  total: number,
): { readonly links: PaginationLinks; readonly meta: CollectionMeta } {
  const totalPages = Math.ceil(total / page.size);
  const last = Math.max(totalPages, 1);
  const kept = queryParams(c).pairs.filter(([name]) => name !== "page[number]");
  const link = (number: number) => {
    const pairs = [...kept, ["page[number]", String(number)] as const];
    return `${c.req.path}?${pairs.map(([name, value]) => `${quotePlus(name)}=${quotePlus(value)}`).join("&")}`;
  };
  return {
    links: {
      first: link(1),
      last: link(last),
      prev: page.number > 1 ? link(page.number - 1) : null,
      next: page.number < last ? link(page.number + 1) : null,
    },
    meta: { page: { number: page.number, size: page.size, total, totalPages } },
  };
}
