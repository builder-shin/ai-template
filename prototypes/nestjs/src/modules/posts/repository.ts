import { Injectable } from "@nestjs/common";
import type { Post, Prisma } from "../../generated/prisma/client.js";
import { PrismaService } from "../../core/db/prisma.service.js";
import type { Tx } from "../../core/db/unit-of-work.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { lockForUpdate } from "../../core/db/locks.js";
export type PostRecord = Post;
function literalContains(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
@Injectable()
export class PostsRepository {
  constructor(private readonly db: PrismaService) {}
  get(id: string, tx: Tx = this.db) {
    return tx.post.findUnique({ where: { id } });
  }
  async locked(tx: Tx, id: string) {
    await lockForUpdate(tx)`SELECT id FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
    return this.get(id, tx);
  }
  async page(tx: Tx, query: ParsedQuery, statuses: readonly string[]) {
    const author = query.filter.author,
      q = query.filter.q;
    const where: Prisma.PostWhereInput = {
      status: { in: [...statuses] },
      ...(typeof author === "string" ? { authorId: author } : {}),
      ...(typeof q === "string" && q
        ? {
            OR: [
              { title: { contains: literalContains(q), mode: "insensitive" } },
              { body: { contains: literalContains(q), mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const columns = { createdAt: "createdAt", publishedAt: "publishedAt", title: "title" } as const;
    const orderBy: Prisma.PostOrderByWithRelationInput[] = query.sort.length
      ? query.sort.map((s) => ({
          [columns[s.name as keyof typeof columns]]: s.descending ? "desc" : "asc",
        }))
      : [{ createdAt: "desc" }];
    orderBy.push({ id: "asc" });
    const total = await tx.post.count({ where });
    const rows = await tx.post.findMany({
      where,
      orderBy,
      skip: (query.page.number - 1) * query.page.size,
      take: query.page.size,
    });
    return { rows, total };
  }
  create(
    tx: Tx,
    data: {
      authorId: string;
      title: string;
      body: string;
      status: string;
      publishedAt: Date | null;
      coverImageId: string | null;
    },
  ) {
    return tx.post.create({ data });
  }
  update(
    tx: Tx,
    id: string,
    data: {
      title?: string;
      body?: string;
      status?: string;
      publishedAt?: Date | null;
      coverImageId?: string | null;
    },
  ) {
    return tx.post.update({ where: { id }, data });
  }
  remove(tx: Tx, id: string) {
    return tx.post.delete({ where: { id } });
  }
  withCover(tx: Tx, id: string) {
    return tx.post.findMany({
      where: { coverImageId: id },
      select: { authorId: true, status: true },
    });
  }
  async references(tx: Tx, ids: readonly string[]): Promise<ReadonlySet<string>> {
    return new Set(
      (
        await tx.post.findMany({
          where: { coverImageId: { in: [...ids] } },
          select: { coverImageId: true },
        })
      ).flatMap((p) => (p.coverImageId ? [p.coverImageId] : [])),
    );
  }
  async ensureExamples(tx: Tx, authorId: string): Promise<void> {
    if (await tx.post.count({ where: { authorId } })) return;
    for (const [title, body, status] of [
      [
        "환영합니다",
        "# 환영합니다\n\nAI 템플릿의 예제 글이다. 발행된 글은 누구나 본다.",
        "published",
      ],
      [
        "마크다운으로 쓰기",
        "본문은 **마크다운**이다.\n\n- 목록\n- 링크: [JSON:API](https://jsonapi.org)",
        "published",
      ],
      ["초안", "초안은 작성자와 posts:manage만 본다.", "draft"],
    ] as const)
      await this.create(tx, {
        authorId,
        title,
        body,
        status,
        publishedAt: status === "published" ? new Date() : null,
        coverImageId: null,
      });
  }
}
