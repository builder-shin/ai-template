import { Injectable } from "@nestjs/common";
import { z } from "zod";
import type { Tx } from "../../core/db/unit-of-work.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import type { Principal } from "../../core/security/principal.js";
import { resourceObject } from "../../core/jsonapi/document.js";
import { ApiError } from "../../core/jsonapi/errors.js";
export interface PostRecord {
  id: string;
  authorId: string;
  title: string;
  body: string;
  status: "draft" | "published";
  publishedAt: Date | null;
  coverImageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
@Injectable()
export class PostsRepository {
  coverReferenceCount(tx: Tx, id: string): Promise<number> {
    return tx.post.count({ where: { coverImageId: id } });
  }
  async list(tx: Tx, query: ParsedQuery, viewer: Principal | undefined) {
    const { author, status, q } = query.filter;
    const drafts =
      viewer?.permissions.has("posts:manage") || (viewer !== undefined && author === viewer.userId);
    const where: Prisma.PostWhereInput = {
      AND: [
        ...(drafts ? [] : [{ status: "published" as const }]),
        ...(typeof status === "string" ? [{ status: status as PostRecord["status"] }] : []),
        ...(typeof author === "string" ? [{ authorId: author }] : []),
        ...(typeof q === "string"
          ? [
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { body: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const total = await tx.post.count({ where });
    const rows = await tx.post.findMany({
      where,
      orderBy: [
        ...query.sort.map((s) => ({
          [s.field]: s.descending ? ("desc" as const) : ("asc" as const),
        })),
        { id: "asc" },
      ],
      skip: (query.page.number - 1) * query.page.size,
      take: query.page.size,
    });
    return { total, rows };
  }
  find(tx: Tx, id: string): Promise<PostRecord | null> {
    return tx.post.findUnique({ where: { id } });
  }
  async lock(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM posts WHERE id = ${id}::uuid FOR UPDATE`;
  }
  create(
    tx: Tx,
    data: Pick<
      PostRecord,
      "authorId" | "title" | "body" | "status" | "publishedAt" | "coverImageId"
    >,
  ): Promise<PostRecord> {
    return tx.post.create({ data });
  }
  update(
    tx: Tx,
    id: string,
    data: Pick<PostRecord, "title" | "body" | "status" | "publishedAt" | "coverImageId">,
  ): Promise<PostRecord> {
    return tx.post.update({ where: { id }, data });
  }
  async delete(tx: Tx, id: string): Promise<void> {
    await tx.post.delete({ where: { id } });
  }
  async lockCovers(tx: Tx, ids: readonly string[]): Promise<void> {
    for (const id of [...new Set(ids.map((id) => id.toLowerCase()))].sort()) {
      if (!z.regexes.uuid().test(id))
        throw new ApiError({
          status: 404,
          code: "resource.not_found",
          title: "표지 파일이 없다",
          source: { pointer: "/data/relationships/coverImage/data" },
        });
      await tx.$queryRaw`SELECT id FROM files WHERE id = ${id}::uuid FOR UPDATE`;
    }
  }
  async attachCover(tx: Tx, viewer: Principal, id: string): Promise<void> {
    const file = z.regexes.uuid().test(id) ? await tx.file.findUnique({ where: { id } }) : null;
    const source = { pointer: "/data/relationships/coverImage/data" };
    if (!file || file.ownerId !== viewer.userId)
      throw new ApiError({
        status: 404,
        code: "resource.not_found",
        title: "표지 파일이 없다",
        source,
      });
    if (file.status !== "ready")
      throw new ApiError({
        status: 422,
        code: "file.upload_incomplete",
        title: "표지 업로드가 끝나지 않았다",
        source,
      });
    await tx.file.update({ where: { id }, data: { detachedAt: null } });
  }
  async readableCoverIds(
    tx: Tx,
    ids: readonly string[],
    viewer: Principal | undefined,
  ): Promise<ReadonlySet<string>> {
    const rows = await tx.post.findMany({
      where: {
        coverImageId: { in: [...new Set(ids)] },
        ...(viewer?.permissions.has("posts:manage")
          ? {}
          : { OR: [{ status: "published" }, ...(viewer ? [{ authorId: viewer.userId }] : [])] }),
      },
      select: { coverImageId: true },
    });
    return new Set(rows.flatMap((p) => (p.coverImageId ? [p.coverImageId] : [])));
  }
  resource(post: PostRecord) {
    return resourceObject(
      "posts",
      post.id,
      {
        title: post.title,
        body: post.body,
        status: post.status,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      },
      {
        author: { data: { type: "users", id: post.authorId } },
        coverImage: { data: post.coverImageId ? { type: "files", id: post.coverImageId } : null },
      },
    );
  }
}
