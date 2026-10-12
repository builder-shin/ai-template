import type { Principal } from "../../core/security/principal.js";
export const TRANSITIONS = new Set(["draft:published", "published:draft"]);
export function canTransition(current: string, wanted: string): boolean {
  return current === wanted || TRANSITIONS.has(`${current}:${wanted}`);
}
export function manages(viewer: Principal | null): boolean {
  return viewer?.permissions.has("posts:manage") ?? false;
}
export function canEdit(post: { authorId: string }, viewer: Principal | null): boolean {
  return manages(viewer) || viewer?.userId === post.authorId;
}
export function canView(
  post: { authorId: string; status: string },
  viewer: Principal | null,
): boolean {
  return post.status === "published" || canEdit(post, viewer);
}
export function seesDrafts(viewer: Principal | null, author: unknown): boolean {
  return manages(viewer) || (viewer !== null && author === viewer.userId);
}
