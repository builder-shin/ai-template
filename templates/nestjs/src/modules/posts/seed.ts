import type { Tx } from "../../core/db/unit-of-work.js";
export async function seedPosts(tx: Tx, authorId: string): Promise<void> {
  if (await tx.post.count({ where: { authorId } })) return;
  const at = new Date();
  await tx.post.createMany({
    data: [
      {
        authorId,
        title: "첫 번째 발행 글",
        body: "글 목록과 본문을 확인한다.",
        status: "published",
        publishedAt: at,
      },
      {
        authorId,
        title: "두 번째 발행 글",
        body: "검색과 정렬을 확인한다.",
        status: "published",
        publishedAt: at,
      },
      { authorId, title: "작성 중인 글", body: "초안은 저자와 관리자만 읽는다.", status: "draft" },
    ],
  });
}
