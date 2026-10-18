import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { UnitOfWork, type Tx, type AfterCommit } from "../../core/db/unit-of-work.js";
import type { Principal } from "../../core/security/principal.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { STORAGE_CLIENTS, type StorageClients } from "../../core/storage/client.js";
import { presignUpload, presignDownload } from "../../core/storage/presign.js";
import { storageFailure } from "../../core/storage/diagnostics.js";
import { FilesRepository, type FileRecord } from "./repository.js";
import { readableFileIds } from "./policies.js";
export interface FileCreateAttributes {
  filename: string;
  contentType: string;
  size: number;
}
function incomplete(): ApiError {
  return new ApiError({
    status: 422,
    code: "file.upload_incomplete",
    title: "업로드가 끝나지 않았다",
  });
}
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(STORAGE_CLIENTS) private readonly clients: StorageClients,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async create(principal: Principal, attributes: FileCreateAttributes) {
    if (
      !Number.isSafeInteger(attributes.size) ||
      attributes.size < 1 ||
      attributes.size > this.settings.FILE_MAX_SIZE
    )
      throw new ApiError({
        status: 422,
        code: "file.too_large",
        title: "파일 크기가 허용 범위를 넘었다",
        source: { pointer: "/data/attributes/size" },
        meta: { params: { max: this.settings.FILE_MAX_SIZE } },
      });
    if (!this.settings.FILE_ALLOWED_TYPES.includes(attributes.contentType))
      throw new ApiError({
        status: 422,
        code: "file.type_not_allowed",
        title: "파일 타입을 허용하지 않는다",
        source: { pointer: "/data/attributes/contentType" },
        meta: { params: { allowed: [...this.settings.FILE_ALLOWED_TYPES].sort().join(", ") } },
      });
    return this.unit.run(async (tx) => {
      await this.repository.lockQuota(tx, principal.userId);
      const size = BigInt(attributes.size);
      if (
        (await this.repository.totalSize(tx, principal.userId)) + size >
        BigInt(this.settings.FILE_USER_QUOTA)
      )
        throw new ApiError({
          status: 422,
          code: "file.quota_exceeded",
          title: "파일 한도를 넘었다",
          source: { pointer: "/data/attributes/size" },
          meta: { params: { quota: this.settings.FILE_USER_QUOTA } },
        });
      const file = await this.repository.create(tx, {
        ...attributes,
        size,
        ownerId: principal.userId,
        key: `${principal.userId}/${randomUUID()}`,
      });
      const upload = await presignUpload(this.clients.public, {
        bucket: this.settings.S3_BUCKET,
        key: file.key,
        contentType: file.contentType,
        size: attributes.size,
      });
      return {
        data: {
          ...this.resource(file),
          meta: {
            upload: {
              ...upload,
              method: "PUT" as const,
              expiresAt: new Date(Date.now() + 900_000).toISOString(),
            },
          },
        },
      };
    });
  }
  complete(principal: Principal, id: string, confirm = true) {
    return this.unit.run(async (tx) => {
      const file = await this.visible(tx, principal, id, true);
      if (!confirm) return { data: await this.downloadResource(file) };
      let head;
      try {
        head = await this.clients.internal.send(
          new HeadObjectCommand({ Bucket: this.settings.S3_BUCKET, Key: file.key }),
        );
      } catch (error) {
        const failure = storageFailure(error);
        if (failure.httpStatus === 404) throw incomplete();
        this.logger.warn({
          message: "파일 완료 스토리지 요청이 실패했다",
          phase: "complete_head",
          ...failure,
        });
        throw new ApiError({
          status: 503,
          code: "service.unavailable",
          title: "스토리지를 사용할 수 없다",
        });
      }
      if (head.ContentLength !== Number(file.size) || head.ContentType !== file.contentType)
        throw incomplete();
      return { data: await this.downloadResource(await this.repository.ready(tx, id)) };
    });
  }
  get(principal: Principal | undefined, id: string, fields?: readonly string[]) {
    return this.unit.run(async (tx) => {
      const resource = await this.downloadResource(await this.visible(tx, principal, id));
      if (fields === undefined) return { data: resource };
      const { relationships, ...rest } = resource;
      return {
        data: {
          ...rest,
          attributes: Object.fromEntries(
            Object.entries(resource.attributes).filter(([key]) => fields.includes(key)),
          ),
          ...(fields.includes("owner") ? { relationships } : {}),
        },
      };
    });
  }
  delete(principal: Principal, id: string): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      const file = await this.visible(tx, principal, id, true);
      await this.repository.delete(tx, id);
      this.removeObject(afterCommit, file.key);
    });
  }
  async detach(tx: Tx, ids: readonly string[], afterCommit?: AfterCommit): Promise<void> {
    const targets = [...new Set(ids)];
    await this.repository.detach(tx, targets);
    afterCommit?.(() =>
      this.unit.run(async (cleanupTx, cleanupCommit) => {
        for (const file of await this.repository.claimDetached(cleanupTx, targets))
          this.removeObject(cleanupCommit, file.key);
      }),
    );
  }
  async loadReferenced(tx: Tx, ids: readonly string[]) {
    const targets = [...new Set(ids)];
    const files = await this.repository.findMany(tx, targets);
    return Promise.all(
      files
        .filter((file) => targets.includes(file.id) && file.status === "ready")
        .map((file) => this.downloadResource(file)),
    );
  }
  purgePending(): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      const files = await this.repository.purgeCandidates(tx, new Date(Date.now() - 86_400_000));
      for (const file of files) {
        if (file.detachedAt !== null) {
          for (const claimed of await this.repository.claimDetached(tx, [file.id]))
            this.removeObject(afterCommit, claimed.key);
          continue;
        }
        await this.repository.delete(tx, file.id);
        this.removeObject(afterCommit, file.key);
      }
    });
  }
  async load(tx: Tx, ids: readonly string[], viewer: Principal | undefined) {
    const files = await this.repository.findMany(tx, ids);
    const allowed = await readableFileIds(tx, viewer, files);
    return Promise.all(
      files.filter((file) => allowed.has(file.id)).map((file) => this.downloadResource(file)),
    );
  }
  private async visible(
    tx: Tx,
    viewer: Principal | undefined,
    id: string,
    write = false,
  ): Promise<FileRecord> {
    const file = await this.repository.find(tx, id);
    if (!file || !(await readableFileIds(tx, viewer, [file])).has(id))
      throw new ApiError({ status: 404, code: "resource.not_found", title: "파일이 없다" });
    if (write && viewer?.userId !== file.ownerId)
      throw new ApiError({ status: 403, code: "permission.denied", title: "파일을 고칠 수 없다" });
    return file;
  }
  private resource(file: FileRecord) {
    const size = Number(file.size);
    if (!Number.isSafeInteger(size) || size < 1)
      throw new Error("파일 크기가 안전 정수 범위를 벗어났다");
    return {
      type: "files" as const,
      id: file.id,
      attributes: {
        filename: file.filename,
        contentType: file.contentType,
        size,
        status: file.status,
        createdAt: file.createdAt.toISOString(),
      },
      relationships: { owner: { data: { type: "users" as const, id: file.ownerId } } },
    };
  }
  private async downloadResource(file: FileRecord) {
    const resource = this.resource(file);
    return file.status === "ready"
      ? {
          ...resource,
          meta: {
            downloadUrl: await presignDownload(
              this.clients.public,
              this.settings.S3_BUCKET,
              file.key,
            ),
            downloadUrlExpiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        }
      : resource;
  }
  private removeObject(afterCommit: AfterCommit, key: string): void {
    afterCommit(async () => {
      await this.clients.internal.send(
        new DeleteObjectCommand({ Bucket: this.settings.S3_BUCKET, Key: key }),
      );
    });
  }
}
