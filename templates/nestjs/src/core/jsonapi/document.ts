import type { ParsedQuery } from "./query.js";
export interface ResourceObject {
  type: string;
  id: string;
  attributes: object;
  relationships?: object;
}
export interface Links {
  first: string;
  prev: string | null;
  next: string | null;
  last: string;
}
export interface CollectionDocument {
  data: readonly ResourceObject[];
  included?: readonly ResourceObject[];
  meta: { page: ParsedQuery["page"] & { total: number; totalPages: number } };
  links: Links;
}
export function resourceObject(
  type: string,
  id: string,
  attributes: object,
  relationships?: object,
): ResourceObject {
  return { type, id, attributes, ...(relationships === undefined ? {} : { relationships }) };
}
export function paginationLinks(
  path: string,
  search: string,
  page: ParsedQuery["page"],
  total: number,
): Links {
  const last = Math.max(1, Math.ceil(total / page.size));
  const link = (number: number) => {
    const query = new URLSearchParams(search);
    query.delete("page[number]");
    query.append("page[number]", String(number));
    return `${path}?${query.toString()}`;
  };
  return {
    first: link(1),
    prev: page.number > 1 ? link(page.number - 1) : null,
    next: page.number < last ? link(page.number + 1) : null,
    last: link(last),
  };
}
export function collectionDocument(
  data: readonly ResourceObject[],
  options: {
    included?: readonly ResourceObject[];
    total: number;
    page: ParsedQuery["page"];
    path: string;
    search: string;
  },
): CollectionDocument {
  return {
    data,
    ...(options.included === undefined ? {} : { included: options.included }),
    meta: {
      page: {
        ...options.page,
        total: options.total,
        totalPages: Math.ceil(options.total / options.page.size),
      },
    },
    links: paginationLinks(options.path, options.search, options.page, options.total),
  };
}
