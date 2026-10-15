import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
export function cacheKey(query: ParsedQuery, viewer: Principal | undefined): string | undefined {
  if (
    viewer?.permissions.has("posts:manage") ||
    query.page.number !== 1 ||
    query.page.size !== 20 ||
    Object.keys(query.filter).length ||
    Object.keys(query.fields).length ||
    query.sort.length !== 1 ||
    query.sort[0]?.field !== "createdAt" ||
    !query.sort[0].descending
  )
    return undefined;
  return [...new Set(query.include)].sort().join(",");
}
