import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { UnitOfWork, type Tx } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { Principal } from "../../../core/security/principal.js";
import type { Settings } from "../../../core/config/settings.js";
import { FilesRepository, FilesService, type FileRecord, type NewFile } from "../index.js";
export const principal: Principal = { userId: "u1", sessionId: "s1", permissions: new Set() };
export const attributes = { filename: "그림.png", contentType: "image/png", size: 23 };
export const file: FileRecord = {
  id: "f1",
  ownerId: "u1",
  key: "u1/f1",
  ...attributes,
  size: 23n,
  status: "pending",
  detachedAt: null,
  createdAt: new Date("2026-10-14T01:00:00Z"),
};
export function fixture(overrides: Partial<Settings> = {}) {
  let committed: FileRecord[] = [];
  let active: FileRecord[] | undefined;
  const events: string[] = [];
  let fail = false;
  let headFailure: unknown;
  const state = () => {
    if (!active) throw new Error("트랜잭션 밖이다");
    return active;
  };
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      active = structuredClone(committed);
      events.push("begin");
      try {
        const result = await fn({
          user: { findMany: () => Promise.resolve([]), count: () => Promise.resolve(0) },
          post: { findMany: () => Promise.resolve([]), count: () => Promise.resolve(0) },
        } as unknown as Tx);
        if (fail) throw new Error("commit 실패");
        committed = active;
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      } finally {
        active = undefined;
      }
    },
  } as unknown as PrismaService);
  class MemoryRepository extends FilesRepository {
    override lock(): Promise<void> {
      return Promise.resolve();
    }
    override lockQuota(_tx: Tx, id: string) {
      events.push("lock:" + id);
      return Promise.resolve();
    }
    override totalSize(_tx: Tx, id: string) {
      events.push("sum");
      return Promise.resolve(
        state()
          .filter((f) => f.ownerId === id && ["pending", "ready"].includes(f.status))
          .reduce((sum, f) => sum + f.size, 0n),
      );
    }
    override create(_tx: Tx, input: NewFile) {
      const record = {
        ...structuredClone(file),
        ...input,
        id: `f${String(state().length + 1)}`,
        createdAt: new Date(),
      };
      state().push(record);
      events.push("insert");
      return Promise.resolve(record);
    }
    override find(_tx: Tx, id: string) {
      return Promise.resolve(state().find((f) => f.id === id) ?? null);
    }
    override findMany(_tx: Tx, ids: readonly string[]) {
      return Promise.resolve(state().filter((f) => ids.includes(f.id)));
    }
    override ready(_tx: Tx, id: string) {
      const found = state().find((f) => f.id === id);
      if (!found) throw new Error("없다");
      found.status = "ready";
      return Promise.resolve(found);
    }
    override delete(_tx: Tx, id: string) {
      const index = state().findIndex((f) => f.id === id);
      if (index < 0) throw new Error("없다");
      state().splice(index, 1);
      events.push("delete-row");
      return Promise.resolve();
    }
    override detach(_tx: Tx, ids: readonly string[]) {
      for (const f of state()) if (ids.includes(f.id)) f.detachedAt = new Date();
      return Promise.resolve();
    }
    override deletePending(tx: Tx, id: string, cutoff: Date) {
      const found = state().find((f) => f.id === id);
      if (
        !found ||
        found.status !== "pending" ||
        found.detachedAt !== null ||
        found.createdAt >= cutoff
      )
        return Promise.resolve(false);
      return this.delete(tx, id).then(() => true);
    }
    override purgeCandidates(_tx: Tx, cutoff: Date, take: number, after?: string) {
      return Promise.resolve(
        structuredClone(
          state()
            .filter(
              (f) =>
                (after === undefined || f.id > after) &&
                (f.detachedAt !== null || (f.status === "pending" && f.createdAt < cutoff)),
            )
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .slice(0, take),
        ),
      );
    }
  }
  const publicClient = new S3Client({
    region: "us-east-1",
    endpoint: "https://public.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture-access", secretAccessKey: "fixture-signing-only" }, // betterleaks:allow 사유: 네트워크 없는 서명 시험 값
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const objects = new Map<string, { ContentLength: number; ContentType: string }>();
  const internal = {
    send(command: unknown) {
      if (command instanceof HeadObjectCommand) {
        events.push(`head:${command.input.Key ?? ""}`);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- 외부 SDK의 임의 거절 값도 시험한다.
        if (headFailure !== undefined) return Promise.reject(headFailure);
        const found = objects.get(command.input.Key ?? "");
        return found
          ? Promise.resolve(found)
          : Promise.reject(
              Object.assign(new Error("없다"), {
                name: "NotFound",
                $metadata: { httpStatusCode: 404 },
              }),
            );
      }
      if (command instanceof DeleteObjectCommand) {
        if (active) throw new Error("객체 삭제는 commit 뒤다");
        objects.delete(command.input.Key ?? "");
        events.push("delete-object");
        return Promise.resolve({});
      }
      throw new Error("예상하지 않은 S3 요청이다");
    },
  } as unknown as S3Client;
  const repository = new MemoryRepository();
  const settings = {
    S3_BUCKET: "app",
    FILE_MAX_SIZE: 100,
    FILE_ALLOWED_TYPES: ["image/png"],
    FILE_USER_QUOTA: 100,
    ...overrides,
  } as Settings;
  const service = new FilesService(unit, repository, { internal, public: publicClient }, settings);
  return {
    service,
    unit,
    repository,
    events,
    objects,
    close: () => {
      publicClient.destroy();
    },
    add: (input: Partial<FileRecord> = {}) =>
      committed.push({ ...structuredClone(file), ...input }),
    get files() {
      return committed;
    },
    set failCommit(value: boolean) {
      fail = value;
    },
    set headFailure(value: unknown) {
      headFailure = value;
    },
  };
}
