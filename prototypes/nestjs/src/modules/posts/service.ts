import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import type { Tx } from "../../core/db/unit-of-work.js";
import type { Principal } from "../../core/security/principal.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { applySparseFields } from "../../core/jsonapi/fields.js";
import { paginationLinks } from "../../core/jsonapi/pagination.js";
import { assembleIncluded } from "../../core/jsonapi/include.js";
import { recordAudit } from "../../core/audit/record.js";
import { FilesService } from "../files/index.js";
import { UsersService, publicUser } from "../users/index.js";
import { PostsRepository } from "./repository.js";
import type { PostRecord } from "./repository.js";
import { canEdit, canView, canTransition, seesDrafts } from "./policies.js";
import { PostEvents } from "./events.js";
import type { PostEventDeclaration } from "./events.js";
import { PostResource } from "./schemas.js";
import type { PostCreateDocument, PostUpdateDocument } from "./schemas.js";
const COVER_POINTER = "/data/relationships/coverImage/data";
export function postResource(post: PostRecord) {
  return PostResource.parse({
    type: "posts",
    id: post.id,
    attributes: {
      title: post.title,
      body: post.body,
      status: post.status,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    },
    relationships: {
      author: { data: { type: "users", id: post.authorId } },
      coverImage: { data: post.coverImageId ? { type: "files", id: post.coverImageId } : null },
    },
  });
}
@Injectable()
export class PostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly uow: UnitOfWork,
    private readonly users: UsersService,
    private readonly files: FilesService,
    private readonly events: PostEvents,
  ) {}
  registerEvents(declarations: readonly PostEventDeclaration[]): void {
    this.events.register(declarations);
  }
  async coverImageReadable(tx: Tx, id: string, viewer: Principal | null): Promise<boolean> {
    return (await this.repository.withCover(tx, id)).some((p) => canView(p, viewer));
  }
  coverImageReferences(tx: Tx, ids: readonly string[]) {
    return this.repository.references(tx, ids);
  }
  ensureExamples(tx: Tx, authorId: string) {
    return this.repository.ensureExamples(tx, authorId);
  }
  private async included(tx: Tx, rows: readonly PostRecord[], query: ParsedQuery) {
    const authorIds = [...new Set(rows.map((r) => r.authorId))],
      fileIds = rows.flatMap((r) => (r.coverImageId ? [r.coverImageId] : []));
    return assembleIncluded<{ type: string; id: string }>(query.include, {
      author: async () => (await this.users.many(authorIds, tx)).map(publicUser),
      coverImage: () => this.files.resources(fileIds, tx),
    });
  }
  async list(viewer: Principal | null, query: ParsedQuery) {
    const visible = seesDrafts(viewer, query.filter.author)
      ? ["draft", "published"]
      : ["published"];
    const statuses =
      typeof query.filter.status === "string"
        ? visible.filter((s) => s === query.filter.status)
        : visible;
    return this.uow.run(
      async (tx) => {
        const { rows, total } = await this.repository.page(tx, query, statuses);
        return applySparseFields(
          {
            data: rows.map(postResource),
            ...(query.include.length ? { included: await this.included(tx, rows, query) } : {}),
            ...paginationLinks("/api/v1/posts", query.raw, query.page, total),
          },
          query.fields,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  private async visible(tx: Tx, id: string, viewer: Principal | null, lock = false) {
    const post = lock ? await this.repository.locked(tx, id) : await this.repository.get(id, tx);
    if (!post || !canView(post, viewer)) throw new ApiError(404, "resource.not_found");
    return post;
  }
  async get(id: string, viewer: Principal | null, query: ParsedQuery) {
    return this.uow.run(
      async (tx) => {
        const post = await this.visible(tx, id, viewer);
        return applySparseFields(
          {
            data: postResource(post),
            ...(query.include.length ? { included: await this.included(tx, [post], query) } : {}),
          },
          query.fields,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  private async coverId(tx: Tx, actor: Principal, id: string | null) {
    return id === null ? null : (await this.files.attachableFile(tx, actor, id, COVER_POINTER)).id;
  }
  async create(actor: Principal, data: z.infer<typeof PostCreateDocument>["data"]) {
    return this.uow.run(async (tx, afterCommit) => {
      const status = data.attributes.status ?? "draft";
      const post = await this.repository.create(tx, {
        authorId: actor.userId,
        title: data.attributes.title,
        body: data.attributes.body,
        status,
        publishedAt: status === "published" ? new Date() : null,
        coverImageId: await this.coverId(
          tx,
          actor,
          data.relationships?.coverImage?.data?.id ?? null,
        ),
      });
      const resource = postResource(post);
      this.events.created(afterCommit, resource);
      return { data: resource };
    });
  }
  async update(actor: Principal, id: string, data: z.infer<typeof PostUpdateDocument>["data"]) {
    return this.uow.run(async (tx, afterCommit) => {
      const post = await this.visible(tx, id, actor, true);
      if (!canEdit(post, actor)) throw new ApiError(403, "permission.denied");
      const attributes = data.attributes ?? {},
        wanted = attributes.status;
      if (wanted && !canTransition(post.status, wanted))
        throw new ApiError(422, "post.invalid_transition", undefined, {
          pointer: "/data/attributes/status",
        });
      const cover = data.relationships?.coverImage;
      const coverImageId =
        cover === undefined
          ? post.coverImageId
          : await this.coverId(tx, actor, cover.data?.id ?? null);
      const updated = await this.repository.update(tx, id, {
        ...(attributes.title === undefined ? {} : { title: attributes.title }),
        ...(attributes.body === undefined ? {} : { body: attributes.body }),
        ...(wanted ? { status: wanted } : {}),
        ...(wanted && wanted !== post.status
          ? { publishedAt: wanted === "published" ? new Date() : null }
          : {}),
        ...(cover === undefined ? {} : { coverImageId }),
      });
      const resource = postResource(updated);
      this.events.updated(afterCommit, resource, post.status);
      if (coverImageId !== post.coverImageId)
        await this.files.release(tx, afterCommit, [post.coverImageId]);
      return { data: resource };
    });
  }
  async delete(actor: Principal, id: string, ipAddress?: string): Promise<void> {
    await this.uow.run(async (tx, afterCommit) => {
      const post = await this.visible(tx, id, actor, true);
      if (!canEdit(post, actor)) throw new ApiError(403, "permission.denied");
      await this.repository.remove(tx, id);
      this.events.deleted(afterCommit, postResource(post));
      if (post.authorId !== actor.userId)
        await recordAudit(tx, "post.deleted_by_admin", {
          actorId: actor.userId,
          targetId: post.id,
          targetType: "posts",
          ...(ipAddress ? { ipAddress } : {}),
          metadata: { author: post.authorId },
        });
      await this.files.release(tx, afterCommit, [post.coverImageId]);
    });
  }
}
