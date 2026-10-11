import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import type { Tx, AfterCommit } from "../../core/db/unit-of-work.js";
import { safeInt64 } from "../../core/db/errors.js";
import { Storage } from "../../core/storage/client.js";
import type { Principal } from "../../core/security/principal.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { applySparseFields } from "../../core/jsonapi/fields.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { FileResource } from "./schemas.js";
import type { FileCreateAttributes } from "./schemas.js";
import { FilesRepository } from "./repository.js";
import type { FileRecord } from "./repository.js";
export type ReadRule = (tx: Tx, id: string, viewer: Principal | null) => Promise<boolean>;
export type ReferenceCheck = (tx: Tx, ids: readonly string[]) => Promise<ReadonlySet<string>>;
@Injectable()
export class FilesService {
  private readonly readRules = new Set<ReadRule>();
  private readonly referenceChecks = new Set<ReferenceCheck>();
  constructor(
    private readonly repository: FilesRepository,
    private readonly uow: UnitOfWork,
    private readonly storage: Storage,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  addReadRule(rule: ReadRule): void {
    this.readRules.add(rule);
  }
  addReferenceCheck(check: ReferenceCheck): void {
    this.referenceChecks.add(check);
  }
  async resource(file: FileRecord, upload?: Awaited<ReturnType<Storage["upload"]>>) {
    return FileResource.parse({
      type: "files",
      id: file.id,
      attributes: {
        filename: file.filename,
        contentType: file.contentType,
        size: safeInt64(file.size),
        status: file.status,
        createdAt: file.createdAt.toISOString(),
      },
      relationships: { owner: { data: { type: "users", id: file.ownerId } } },
      ...(upload || file.status === "ready"
        ? {
            meta: {
              ...(upload ? { upload } : {}),
              ...(file.status === "ready" ? await this.storage.download(`files/${file.id}`) : {}),
            },
          }
        : {}),
    });
  }
  async resources(ids: readonly string[], tx?: Tx) {
    return Promise.all((await this.repository.many(ids, tx)).map((f) => this.resource(f)));
  }
  async create(actor: Principal, attributes: z.infer<typeof FileCreateAttributes>) {
    if (attributes.size > this.settings.FILE_MAX_SIZE)
      throw new ApiError(422, "file.too_large", undefined, {
        pointer: "/data/attributes/size",
        params: { max: this.settings.FILE_MAX_SIZE },
      });
    const allowed = this.settings.FILE_ALLOWED_TYPES.split(",").map((v) => v.trim());
    if (!allowed.includes(attributes.contentType))
      throw new ApiError(422, "file.type_not_allowed", undefined, {
        pointer: "/data/attributes/contentType",
        params: { allowed: [...allowed].sort().join(", ") },
      });
    const file = await this.uow.run(async (tx) => {
      await this.repository.lockOwner(tx, actor.userId);
      const used = await this.repository.used(tx, actor.userId);
      if (used + BigInt(attributes.size) > BigInt(this.settings.FILE_USER_QUOTA))
        throw new ApiError(422, "file.quota_exceeded", undefined, {
          pointer: "/data/attributes/size",
          params: { quota: this.settings.FILE_USER_QUOTA },
        });
      return this.repository.create(tx, {
        ...attributes,
        size: BigInt(attributes.size),
        ownerId: actor.userId,
      });
    });
    return {
      data: await this.resource(
        file,
        await this.storage.upload(`files/${file.id}`, file.contentType, safeInt64(file.size)),
      ),
    };
  }
  private async readable(tx: Tx, id: string, viewer: Principal | null) {
    const file = await this.repository.get(id, tx);
    if (file) {
      if (file.ownerId === viewer?.userId) return file;
      for (const rule of this.readRules) if (await rule(tx, id, viewer)) return file;
    }
    throw new ApiError(404, "resource.not_found");
  }
  private async owned(tx: Tx, id: string, actor: Principal) {
    const file = await this.readable(tx, id, actor);
    if (file.ownerId !== actor.userId) throw new ApiError(403, "permission.denied");
    return file;
  }
  async get(id: string, viewer: Principal | null, query: ParsedQuery) {
    const file = await this.uow.run((tx) => this.readable(tx, id, viewer));
    return applySparseFields({ data: await this.resource(file) }, query.fields);
  }
  async complete(actor: Principal, id: string, ready = true) {
    const file = await this.uow.run(async (tx) => {
      const file = await this.owned(tx, id, actor);
      if (!ready || file.status === "ready") return file;
      const size = await this.storage.size(`files/${id}`);
      if (size === null || BigInt(size) !== file.size) {
        if (size !== null) await this.storage.delete(`files/${id}`);
        throw new ApiError(422, "file.upload_incomplete");
      }
      return this.repository.ready(tx, id);
    });
    return { data: await this.resource(file) };
  }
  async delete(actor: Principal, id: string): Promise<void> {
    await this.uow.run(async (tx, afterCommit) => {
      await this.owned(tx, id, actor);
      await this.repository.remove(tx, [id]);
      afterCommit(() => this.storage.delete(`files/${id}`));
    });
  }
  async attachableFile(tx: Tx, actor: Principal, id: string, pointer: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new ApiError(404, "resource.not_found", undefined, { pointer });
    const file = await this.repository.get(id, tx);
    if (file?.ownerId !== actor.userId)
      throw new ApiError(404, "resource.not_found", undefined, { pointer });
    if (file.status !== "ready")
      throw new ApiError(422, "file.upload_incomplete", undefined, { pointer });
    if (!file.contentType.startsWith("image/"))
      throw new ApiError(422, "file.type_not_allowed", undefined, {
        pointer,
        params: { allowed: "image/*" },
      });
    return file;
  }
  async release(tx: Tx, afterCommit: AfterCommit, ids: readonly (string | null)[]): Promise<void> {
    const candidates = [...new Set(ids.filter((id): id is string => id !== null))];
    if (!candidates.length) return;
    const referenced = new Set<string>();
    for (const check of this.referenceChecks)
      for (const id of await check(tx, candidates)) referenced.add(id);
    const loose = (await this.repository.many(candidates, tx)).filter((f) => !referenced.has(f.id));
    await this.repository.remove(
      tx,
      loose.map((f) => f.id),
    );
    for (const file of loose) afterCommit(() => this.storage.delete(`files/${file.id}`));
  }
}
