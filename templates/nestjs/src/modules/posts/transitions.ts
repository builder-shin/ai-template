import type { PostStatus } from "./policies.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { POST_STATUSES } from "./schemas.js";
export function nextStatus(from: PostStatus, requested: PostStatus): PostStatus {
  if (!POST_STATUSES.includes(from) || !POST_STATUSES.includes(requested))
    throw new ApiError({
      status: 422,
      code: "post.invalid_transition",
      title: "허용하지 않는 글 상태 전이다",
    });
  return requested;
}
export function publicationTime(
  from: PostStatus,
  to: PostStatus,
  previous: Date | null,
  at: Date,
): Date | null {
  return to === "draft" ? null : from === "published" ? previous : at;
}
