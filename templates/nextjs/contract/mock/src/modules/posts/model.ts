/**
 * 글(FastAPI의 posts 테이블).
 *
 * - 상태는 draft와 published다. 바꿀 수 있는 전이는 policies.ts의 TRANSITIONS가 정한다.
 * - 발행하면 publishedAt을 채우고, 발행을 취소하면 null로 되돌린다.
 * - 작성자가 탈퇴해도 글은 남는다(사용자 행은 지우지 않고 status만 deleted로 바꾼다). 커버 이미지 파일을
 *   지우면 coverImageId가 null이 된다(FastAPI의 외래 키 ON DELETE SET NULL, covers.ts의 삭제 처리).
 */

import type { Instant } from "../../core/clock.ts";
import type { components } from "../../generated/api.ts";

export type PostStatus = components["schemas"]["PostStatus"];

export interface PostRow {
  readonly id: string;
  readonly authorId: string;
  title: string;
  /** 마크다운 본문. */
  body: string;
  status: PostStatus;
  publishedAt: Instant | null;
  /** 커버 이미지 파일 id. 파일을 지우면 null이 된다. */
  coverImageId: string | null;
  readonly createdAt: Instant;
  updatedAt: Instant;
}
