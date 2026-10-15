import { Inject, Injectable } from "@nestjs/common";
import { UnitOfWork, type Tx, type AfterCommit } from "../../core/db/unit-of-work.js";
import { CacheAside } from "../../core/cache/cache.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import {
  collectionDocument,
  sparseResource,
  type ResourceObject,
} from "../../core/jsonapi/document.js";
import { IncludeRegistry } from "../../core/jsonapi/include.js";
import type { Principal } from "../../core/security/principal.js";
import { RealtimePublisher } from "../../core/realtime/publisher.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { recordAudit } from "../../core/audit/record.js";
import { FilesService } from "../files/index.js";
import { PostsRepository, type PostRecord } from "./repository.js";
import { cacheKey } from "./cache.js";
import { postCollectionDocumentSchema } from "./schemas.js";
import { shapeHash } from "../../core/cache/shape.js";
import { canSee, canModify } from "./policies.js";
import { nextStatus, publicationTime } from "./transitions.js";
import { eventRooms, type PostEventName } from "./events.js";
export interface PostWrite {
  attributes?:
    | {
        title?: string | undefined;
        body?: string | undefined;
        status?: "draft" | "published" | undefined;
      }
    | undefined;
  relationships?:
    { coverImage?: { data: { type: "files"; id: string } | null } | undefined } | undefined;
}
@Injectable()
export class PostsService {
  private readonly shape = shapeHash(postCollectionDocumentSchema);
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(PostsRepository) private readonly posts: PostsRepository,
    @Inject(CacheAside) private readonly cache: CacheAside,
    @Inject(IncludeRegistry) private readonly includes: IncludeRegistry,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(RealtimePublisher) private readonly publisher: RealtimePublisher,
  ) {}
  async list(viewer: Principal | undefined, query: ParsedQuery, search = "") {
    const load = () =>
      this.unit.run(
        async (tx) => {
          const { rows, total } = await this.posts.list(tx, query, viewer);
          const data = rows.map((post) => this.posts.resource(post));
          const included = await this.included(tx, rows, data, query, viewer);
          return { data: data.map((r) => sparseResource(r, query.fields.posts)), included, total };
        },
        { isolationLevel: "RepeatableRead" },
      );
    const key = cacheKey(query, viewer);
    const result =
      key === undefined
        ? await load()
        : await this.cache.remember("posts:list", key, this.shape, load, 60);
    return collectionDocument(result.data, {
      ...(result.included === undefined ? {} : { included: result.included }),
      total: result.total,
      page: query.page,
      path: "/api/v1/posts",
      search,
    });
  }
  get(viewer: Principal | undefined, id: string, query: ParsedQuery) {
    return this.unit.run(
      async (tx) => {
        const post = await this.current(tx, id, viewer);
        const resource = this.posts.resource(post);
        const included = await this.included(tx, [post], [resource], query, viewer);
        return {
          data: sparseResource(resource, query.fields.posts),
          ...(included === undefined ? {} : { included }),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
  create(viewer: Principal, input: PostWrite) {
    return this.unit.run(async (tx, afterCommit) => {
      const attributes = input.attributes;
      if (attributes?.title === undefined || attributes.body === undefined)
        throw new ApiError({
          status: 422,
          code: "validation.required",
          title: "제목과 본문이 필요하다",
        });
      const status = nextStatus("draft", attributes.status ?? "draft");
      const coverImageId = input.relationships?.coverImage?.data?.id ?? null;
      if (coverImageId) {
        await this.posts.lockCovers(tx, [coverImageId]);
        await this.posts.attachCover(tx, viewer, coverImageId);
      }
      const post = await this.posts.create(tx, {
        title: attributes.title,
        body: attributes.body,
        authorId: viewer.userId,
        status,
        publishedAt: publicationTime("draft", status, null, new Date()),
        coverImageId,
      });
      afterCommit(() => this.cache.bump("posts:list"));
      this.emit(afterCommit, "post.created", post);
      if (status === "published") this.emit(afterCommit, "post.published", post);
      return { data: this.posts.resource(post) };
    });
  }
  update(viewer: Principal, id: string, input: PostWrite) {
    return this.unit.run(async (tx, afterCommit) => {
      await this.posts.lock(tx, id);
      const previous = await this.current(tx, id, viewer, true);
      const attributes = input.attributes ?? {};
      const status = nextStatus(previous.status, attributes.status ?? previous.status);
      const cover = input.relationships?.coverImage;
      const coverImageId = cover === undefined ? previous.coverImageId : (cover.data?.id ?? null);
      const title = attributes.title ?? previous.title,
        body = attributes.body ?? previous.body;
      if (
        title === previous.title &&
        body === previous.body &&
        status === previous.status &&
        coverImageId === previous.coverImageId
      )
        return { data: this.posts.resource(previous) };
      if (coverImageId !== previous.coverImageId) {
        await this.posts.lockCovers(
          tx,
          [previous.coverImageId, coverImageId].filter((id): id is string => id !== null),
        );
        if (coverImageId) await this.posts.attachCover(tx, viewer, coverImageId);
      }
      const post = await this.posts.update(tx, id, {
        title,
        body,
        status,
        coverImageId,
        publishedAt: publicationTime(previous.status, status, previous.publishedAt, new Date()),
      });
      if (previous.coverImageId && previous.coverImageId !== coverImageId)
        await this.files.detach(tx, [previous.coverImageId], afterCommit);
      afterCommit(() => this.cache.bump("posts:list"));
      if (previous.status === "published" && status === "draft") {
        this.emit(afterCommit, "post.unpublished", post);
        this.emit(afterCommit, "post.updated", post);
      } else
        this.emit(
          afterCommit,
          previous.status === "draft" && status === "published" ? "post.published" : "post.updated",
          post,
        );
      return { data: this.posts.resource(post) };
    });
  }
  delete(viewer: Principal, id: string): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      await this.posts.lock(tx, id);
      const post = await this.current(tx, id, viewer, true);
      await this.posts.delete(tx, id);
      if (post.coverImageId) await this.files.detach(tx, [post.coverImageId], afterCommit);
      if (viewer.userId !== post.authorId)
        await recordAudit(tx, {
          action: "post.deleted_by_admin",
          actorUserId: viewer.userId,
          target: { type: "posts", id },
        });
      afterCommit(() => this.cache.bump("posts:list"));
      this.emit(afterCommit, "post.deleted", post);
    });
  }
  private async current(
    tx: Tx,
    id: string,
    viewer: Principal | undefined,
    write = false,
  ): Promise<PostRecord> {
    const post = await this.posts.find(tx, id);
    if (!post || !canSee(post, viewer))
      throw new ApiError({ status: 404, code: "resource.not_found", title: "글이 없다" });
    if (write && !canModify(post, viewer))
      throw new ApiError({ status: 403, code: "permission.denied", title: "글을 고칠 수 없다" });
    return post;
  }
  private async included(
    tx: Tx,
    rows: readonly PostRecord[],
    data: readonly ResourceObject[],
    query: ParsedQuery,
    viewer: Principal | undefined,
  ) {
    if (!query.include.length) return undefined;
    const allowed = new Set(
      rows
        .filter((p) => canSee(p, viewer))
        .flatMap((p) => (p.coverImageId ? [p.coverImageId] : [])),
    );
    const included = await this.includes.load(
      tx,
      [...query.include].sort(),
      data,
      viewer,
      (fileTx, ids) =>
        this.files.loadReferenced(
          fileTx,
          ids.filter((id) => allowed.has(id)),
        ),
    );
    return included.map((r) => sparseResource(r, query.fields[r.type]));
  }
  private emit(afterCommit: AfterCommit, name: PostEventName, post: PostRecord): void {
    const data =
      name === "post.unpublished" || name === "post.deleted"
        ? { type: "posts", id: post.id }
        : this.posts.resource(post);
    this.publisher.queue(afterCommit, name, eventRooms(name, post), () => ({ data }));
  }
}
