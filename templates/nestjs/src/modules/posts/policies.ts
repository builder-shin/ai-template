import type { Principal } from "../../core/security/principal.js";
import type { PostStatus } from "./schemas.js";
import { POST_PERMISSIONS } from "./permissions.js";
export type { PostStatus } from "./schemas.js";
export type PostAction = "read" | "update" | "delete" | "publish" | "unpublish";
export function canSee(
  post: { authorId: string; status: PostStatus },
  viewer: Principal | undefined,
): boolean {
  return post.status === "published" || canModify(post, viewer);
}
export function canModify(
  post: { authorId: string; status: PostStatus },
  viewer: Principal | undefined,
): boolean {
  return (
    viewer !== undefined &&
    (viewer.userId === post.authorId || viewer.permissions.has(POST_PERMISSIONS.manage))
  );
}
