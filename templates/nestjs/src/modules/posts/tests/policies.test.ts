import { expect, it } from "vitest";
import type { Principal } from "../../../core/security/principal.js";
import { canSee, canModify, type PostStatus, type PostAction } from "../index.js";
const people: { who: string; viewer: Principal | undefined; seeDraft: boolean; modify: boolean }[] =
  [
    { who: "익명", viewer: undefined, seeDraft: false, modify: false },
    {
      who: "저자",
      viewer: { userId: "a", sessionId: "s", permissions: new Set() },
      seeDraft: true,
      modify: true,
    },
    {
      who: "다른 회원",
      viewer: { userId: "b", sessionId: "s", permissions: new Set(["posts:create"]) },
      seeDraft: false,
      modify: false,
    },
    {
      who: "관리자",
      viewer: { userId: "b", sessionId: "s", permissions: new Set(["posts:manage"]) },
      seeDraft: true,
      modify: true,
    },
  ];
for (const { who, viewer, seeDraft, modify } of people)
  for (const status of ["draft", "published"] as const)
    for (const action of ["read", "update", "delete", "publish", "unpublish"] as const) {
      const allowed = action === "read" ? status === "published" || seeDraft : modify;
      it(`${who}는 ${status} 글의 ${action} 권한이 ${String(allowed)}이다`, () => {
        const post: { authorId: string; status: PostStatus } = { authorId: "a", status };
        const decide = (action: PostAction) =>
          action === "read" ? canSee(post, viewer) : canModify(post, viewer);
        expect(decide(action)).toBe(allowed);
      });
    }
