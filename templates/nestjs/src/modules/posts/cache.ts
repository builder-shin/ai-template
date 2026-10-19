import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
import { listPosts } from "./operations.js";
export function cacheKey(query: ParsedQuery, viewer: Principal | undefined): string | undefined {
  if (
    viewer?.permissions.has("posts:manage") ||
    query.page.number !== 1 ||
    query.page.size !== listPosts.query.page.defaultSize ||
    Object.keys(query.filter).length ||
    Object.keys(query.fields).length ||
    query.sort.map(({ field, descending }) => (descending ? "-" : "") + field).join(",") !==
      listPosts.query.defaultSort
  )
    return undefined;
  return [...new Set(query.include)].sort().join(",");
}
