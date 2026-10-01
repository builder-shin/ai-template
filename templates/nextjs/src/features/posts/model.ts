export type Post = {
  id: string;
  title: string;
  body: string;
  authorName: string | null;
  coverUrl: string | null;
  publishedAt: string | null;
};

export type PostStatus = "draft" | "published";
export type MyPost = Post & { status: PostStatus };
export type MyPostStatus = PostStatus | "all";

export function parseMyPostSearch(params: Record<string, string | string[] | undefined>) {
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  const { page, size } = parsePostSearch(params);
  return {
    status: status === "draft" || status === "published" ? status : ("all" as MyPostStatus),
    page,
    size,
  };
}

export function myPostPageHref(link: string) {
  const api = new URL(link, "http://localhost").searchParams;
  const query = new URLSearchParams();
  query.set("status", api.get("filter[status]") ?? "all");
  query.set("page", api.get("page[number]") ?? "1");
  query.set("size", api.get("page[size]") ?? "10");
  return `/my-posts?${query}`;
}

export const postSorts = {
  latest: "-createdAt",
  published: "-publishedAt",
  title: "title",
} as const;
export type PostSort = keyof typeof postSorts;

export function parsePostSearch(params: Record<string, string | string[] | undefined>) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const sort = first(params.sort);
  const positive = (value: string | undefined, fallback: number, max: number) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 && number <= max ? number : fallback;
  };
  return {
    q: first(params.q)?.trim() ?? "",
    sort: sort === "published" || sort === "title" ? sort : ("latest" as PostSort),
    page: positive(first(params.page), 1, Number.MAX_SAFE_INTEGER),
    size: positive(first(params.size), 10, 100),
  };
}

/** API 주소는 그대로 노출하지 않고 페이지 링크의 검색 조건만 web 경로로 옮긴다. */
export function postPageHref(link: string) {
  const api = new URL(link, "http://localhost").searchParams;
  const query = new URLSearchParams();
  const q = api.get("filter[q]");
  if (q) query.set("q", q);
  const sort = api.get("sort");
  query.set("sort", sort === "title" ? "title" : sort === "-publishedAt" ? "published" : "latest");
  query.set("page", api.get("page[number]") ?? "1");
  query.set("size", api.get("page[size]") ?? "10");
  return `/posts?${query}`;
}
