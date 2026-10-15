import "reflect-metadata";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { UnitOfWork, type Tx } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { Principal } from "../../../core/security/principal.js";
import type { Settings } from "../../../core/config/settings.js";
import type { RedisClients } from "../../../core/redis/clients.js";
import type { RealtimePublisher } from "../../../core/realtime/publisher.js";
import type { ParsedQuery } from "../../../core/jsonapi/query.js";
import { CacheAside } from "../../../core/cache/cache.js";
import { IncludeRegistry } from "../../../core/jsonapi/include.js";
import { FilesService, FilesRepository } from "../../files/index.js";
import { UsersRepository } from "../../users/index.js";
import { PostsRepository, type PostRecord } from "../index.js";
import { PostsService } from "../index.js";
export const authorId = "01900000-0000-7000-8000-000000000001";
export const otherId = "01900000-0000-7000-8000-000000000002";
export const postId = "01900000-0000-7000-8000-000000000003";
export const fileId = "01900000-0000-7000-8000-000000000004";
export const at = new Date("2026-10-15T00:00:00Z");
export const author: Principal = {
  userId: authorId,
  sessionId: "s",
  permissions: new Set(["posts:create"]),
};
export const member: Principal = {
  userId: otherId,
  sessionId: "s",
  permissions: new Set(["posts:create"]),
};
export const manager: Principal = {
  userId: otherId,
  sessionId: "s",
  permissions: new Set(["posts:manage"]),
};
export const query = (change: Partial<ParsedQuery> = {}): ParsedQuery => ({
  filter: {},
  fields: {},
  include: [],
  sort: [{ field: "createdAt", descending: true }],
  page: { number: 1, size: 20 },
  ...change,
});
export const post = (
  status: "draft" | "published" = "draft",
  change: Partial<PostRecord> = {},
): PostRecord => ({
  id: postId,
  authorId,
  title: "고래",
  body: "바다의 글",
  status,
  publishedAt: status === "published" ? at : null,
  coverImageId: null,
  createdAt: at,
  updatedAt: at,
  ...change,
});
type Where = {
  id?: string | { in: string[] };
  authorId?: string;
  status?: string | { in: string[] };
  coverImageId?: string | { in: string[] };
  OR?: Where[];
  AND?: Where[];
  title?: { contains: string };
  body?: { contains: string };
};
function matches(p: PostRecord, w: Where): boolean {
  return (
    (!w.id || (typeof w.id === "string" ? p.id === w.id : w.id.in.includes(p.id))) &&
    (!w.authorId || p.authorId === w.authorId) &&
    (!w.status ||
      (typeof w.status === "string" ? p.status === w.status : w.status.in.includes(p.status))) &&
    (!w.coverImageId ||
      (typeof w.coverImageId === "string"
        ? p.coverImageId === w.coverImageId
        : p.coverImageId !== null && w.coverImageId.in.includes(p.coverImageId))) &&
    (!w.title || p.title.toLowerCase().includes(w.title.contains.toLowerCase())) &&
    (!w.body || p.body.toLowerCase().includes(w.body.contains.toLowerCase())) &&
    (!w.OR || w.OR.some((v) => matches(p, v))) &&
    (!w.AND || w.AND.every((v) => matches(p, v)))
  );
}
export function fixture(initial = [post()]) {
  let state = {
    posts: initial,
    avatarIds: [] as string[],
    files: [
      {
        id: fileId,
        ownerId: authorId,
        key: "cover",
        filename: "표지.png",
        contentType: "image/png",
        size: 23n,
        status: "ready" as "ready" | "pending",
        detachedAt: null as Date | null,
        createdAt: at,
      },
    ],
    audits: [] as object[],
  };
  let active: typeof state | undefined,
    failCommit = false,
    failRedis = false,
    serial = 10;
  const db = () => {
    if (!active) throw new Error("트랜잭션 밖이다");
    return active;
  };
  const trace: string[] = [],
    options: unknown[] = [],
    redisValues = new Map<string, string>();
  const events: { name: string; rooms: readonly string[]; payload: unknown }[] = [],
    removedObjects: string[] = [];
  const tx = {
    $queryRaw: (sql: TemplateStringsArray, id: string) => {
      if (sql.join("").includes("FROM files") && !/^[a-f0-9-]{36}$/iu.test(id))
        throw new Error("UUID cast 오류");
      trace.push("LOCK");
      return Promise.resolve([]);
    },
    post: {
      count: ({ where = {} }: { where?: Where }) => {
        trace.push("SELECT count");
        return Promise.resolve(db().posts.filter((p) => matches(p, where)).length);
      },
      findMany: ({
        where = {},
        skip = 0,
        take = 10000,
        orderBy = [],
      }: {
        where?: Where;
        skip?: number;
        take?: number;
        orderBy?: Record<string, string>[];
      }) => {
        trace.push("SELECT posts");
        const rows = db().posts.filter((p) => matches(p, where));
        rows.sort((a, b) => {
          for (const order of orderBy)
            for (const [key, dir] of Object.entries(order)) {
              const av = a[key as keyof PostRecord],
                bv = b[key as keyof PostRecord];
              const diff = String(av).localeCompare(String(bv));
              if (diff) return dir === "desc" ? -diff : diff;
            }
          return 0;
        });
        return Promise.resolve(structuredClone(rows.slice(skip, skip + take)));
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(structuredClone(db().posts.find((p) => p.id === where.id) ?? null)),
      create: ({ data }: { data: Partial<PostRecord> }) => {
        const row = post("draft", {
          ...data,
          id: data.id ?? `01900000-0000-7000-8000-${String(++serial).padStart(12, "0")}`,
        });
        db().posts.push(row);
        return Promise.resolve(structuredClone(row));
      },
      createMany: ({ data }: { data: Partial<PostRecord>[] }) => {
        for (const d of data) db().posts.push(post("draft", { ...d, id: String(++serial) }));
        return Promise.resolve({ count: data.length });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<PostRecord> }) => {
        const row = required(db().posts.find((p) => p.id === where.id));
        Object.assign(row, data);
        return Promise.resolve(structuredClone(row));
      },
      delete: ({ where }: { where: { id: string } }) => {
        db().posts = db().posts.filter((p) => p.id !== where.id);
        return Promise.resolve();
      },
    },
    user: {
      count: ({ where }: { where: { avatarFileId: string } }) =>
        Promise.resolve(db().avatarIds.filter((id) => id === where.avatarFileId).length),
      findMany: ({
        where,
      }: {
        where: { id?: { in: string[] }; avatarFileId?: { in: string[] } };
      }) => {
        trace.push("SELECT users");
        return Promise.resolve(
          where.id
            ? [authorId, otherId]
                .filter((id) => where.id?.in.includes(id))
                .map((id) => ({
                  id,
                  name: "공개 저자",
                  status: "active",
                  avatarFileId: db().avatarIds[0] ?? null,
                }))
            : [],
        );
      },
    },
    file: {
      findMany: ({
        where,
      }: {
        where: {
          id?: { in: string[] };
          detachedAt?: { not: null };
          OR?: { status?: string; createdAt?: { lt: Date }; detachedAt?: { not: null } }[];
        };
      }) => {
        trace.push("SELECT files");
        return Promise.resolve(
          structuredClone(
            db().files.filter(
              (f) =>
                (!where.id || where.id.in.includes(f.id)) &&
                (!where.detachedAt || f.detachedAt !== null) &&
                (!where.OR ||
                  where.OR.some((w) =>
                    w.detachedAt
                      ? f.detachedAt !== null
                      : f.status === w.status && f.createdAt < (w.createdAt?.lt ?? new Date(0)),
                  )),
            ),
          ),
        );
      },
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(structuredClone(db().files.find((f) => f.id === where.id) ?? null)),
      update: ({ where, data }: { where: { id: string }; data: object }) => {
        const row = required(db().files.find((f) => f.id === where.id));
        Object.assign(row, data);
        return Promise.resolve(row);
      },
      updateMany: ({ where, data }: { where: { id: { in: string[] } }; data: object }) => {
        for (const f of db().files) if (where.id.in.includes(f.id)) Object.assign(f, data);
        return Promise.resolve({ count: 1 });
      },
      delete: ({ where }: { where: { id: string } }) => {
        db().files = db().files.filter((f) => f.id !== where.id);
        return Promise.resolve();
      },
    },
    auditLog: {
      create: ({ data }: { data: object }) => {
        db().audits.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as Tx;
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>, option: unknown) => {
      options.push(option);
      active = structuredClone(state);
      try {
        const result = await fn(tx);
        if (failCommit) throw new Error("commit 실패");
        state = active;
        trace.push("COMMIT");
        return result;
      } finally {
        active = undefined;
      }
    },
  } as unknown as PrismaService);
  const redis = {
    key: (...parts: string[]) => ["aitpl:15", ...parts].join(":"),
    command: {
      get: (key: string) =>
        failRedis
          ? Promise.reject(new Error("Redis 단절"))
          : Promise.resolve(redisValues.get(key) ?? null),
      set: (key: string, value: string) => {
        if (failRedis) return Promise.reject(new Error("Redis 단절"));
        trace.push("cache set");
        redisValues.set(key, value);
        return Promise.resolve("OK");
      },
      incr: (key: string) => {
        if (failRedis) return Promise.reject(new Error("Redis 단절"));
        if (active) throw new Error("commit 전 무효화다");
        trace.push("cache bump");
        const n = Number(redisValues.get(key) ?? 0) + 1;
        redisValues.set(key, String(n));
        return Promise.resolve(n);
      },
    },
  } as unknown as RedisClients;
  const publisher: RealtimePublisher = {
    queue: (afterCommit, name, rooms, payload) => {
      afterCommit(() => {
        if (active) throw new Error("commit 전 알림이다");
        trace.push(name);
        events.push({ name, rooms, payload: payload() });
      });
    },
  };
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://assets.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture-signing" },
  }); // betterleaks:allow 사유: 외부 요청 없는 서명 fixture다
  const internal = {
    send: (command: DeleteObjectCommand) => {
      if (!(command instanceof DeleteObjectCommand) || active)
        throw new Error("commit 뒤 삭제만 허용한다");
      removedObjects.push(command.input.Key ?? "");
      return Promise.resolve({});
    },
  } as unknown as S3Client;
  const files = new FilesService(unit, new FilesRepository(), { internal, public: client }, {
    S3_BUCKET: "app",
  } as Settings);
  const includes = new IncludeRegistry();
  includes.register("users", (tx, ids) => new UsersRepository().load(tx, ids));
  includes.register("files", (tx, ids, viewer) => files.load(tx, ids, viewer));
  const cache = new CacheAside(redis),
    repository = new PostsRepository();
  const service = new PostsService(unit, repository, cache, includes, files, publisher);
  return {
    service,
    unit,
    tx,
    repository,
    cache,
    files,
    events,
    trace,
    options,
    redisValues,
    removedObjects,
    get state() {
      return state;
    },
    set failCommit(v: boolean) {
      failCommit = v;
    },
    set failRedis(v: boolean) {
      failRedis = v;
    },
    close: () => {
      client.destroy();
    },
  };
}
export function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("필수 fixture가 없다");
  return value;
}
