import type { Page } from "./query.js";
export function paginationLinks(
  path: string,
  rawQuery: URLSearchParams,
  page: Page,
  total: number,
) {
  const totalPages = Math.ceil(total / page.size),
    last = Math.max(totalPages, 1);
  const link = (n: number) => {
    const pairs = new URLSearchParams([...rawQuery].filter(([name]) => name !== "page[number]"));
    pairs.append("page[number]", String(n));
    return `${path}?${pairs.toString()}`;
  };
  return {
    links: {
      first: link(1),
      last: link(last),
      prev: page.number > 1 ? link(page.number - 1) : null,
      next: page.number < last ? link(page.number + 1) : null,
    },
    meta: { page: { ...page, total, totalPages } },
  };
}
