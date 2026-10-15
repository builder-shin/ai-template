import { S3Client } from "@aws-sdk/client-s3";
import { UnitOfWork, type Tx } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { Settings } from "../../../core/config/settings.js";
import type { Principal } from "../../../core/security/principal.js";
import type { RealtimePublisher } from "../../../core/realtime/publisher.js";
import { IncludeRegistry } from "../../../core/jsonapi/include.js";
import { RolesRepository } from "../../roles/index.js";
import { FilesRepository, FilesService } from "../../files/index.js";
import { SessionsRepository, SessionsService, AuthRepository } from "../../auth/index.js";
import type { StrictLimiter } from "../../../core/ratelimit/strict.js";
import type { OAuthState } from "../../auth/index.js";
import { SessionRealtimeBridge } from "../../realtime/index.js";
import { MeService } from "../index.js";
import { UsersRepository } from "../index.js";
import { MeRealtimeBridge } from "../index.js";
export const now = new Date("2026-10-14T21:00:00Z");
export const userId = "01900000-0000-7000-8000-000000000001";
export const fileId = "01900000-0000-7000-8000-000000000002";
export const principal: Principal = {
  userId,
  sessionId: "s1",
  permissions: new Set(["posts:create"]),
};
export function fixture() {
  const user = {
    id: userId,
    email: "me@example.test",
    name: "회원",
    passwordHash: "fixture-hash",
    locale: "ko",
    status: "active",
    avatarFileId: null as string | null,
    emailVerifiedAt: now,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now,
  };
  let state = {
    users: [user],
    roles: [
      {
        id: "member",
        name: "member",
        system: true,
        permissions: ["posts:create"],
        description: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "admin",
        name: "admin",
        system: true,
        permissions: [],
        description: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    assignments: [{ userId, roleId: "member" }],
    sessions: ["s1", "s2"].map((id) => ({
      id,
      userId,
      authenticatedAt: now,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date("2030-01-01"),
      revokedAt: null as Date | null,
      revokedReason: null as string | null,
      userAgent: null,
    })),
    files: [
      {
        id: fileId,
        ownerId: userId,
        key: "avatar",
        filename: "그림.png",
        contentType: "image/png",
        size: 23n,
        status: "ready" as "ready" | "pending",
        detachedAt: null as Date | null,
        createdAt: now,
      },
    ],
    oauth: [{ userId }],
    tokens: [{ userId }],
    refresh: [{ sessionId: "s1" }, { sessionId: "s2" }],
    audits: [] as object[],
  };
  let active: typeof state | undefined;
  let failCommit = false;
  const events: { name: string; rooms?: readonly string[]; payload?: unknown }[] = [];
  const trace: string[] = [];
  const db = () => {
    if (!active) throw new Error("트랜잭션 밖이다");
    return active;
  };
  const row = () => required(db().users.find((u) => u.id === userId));
  const assignments = (id: string) =>
    db()
      .assignments.filter((a) => a.userId === id)
      .map((a) => ({ ...a, role: required(db().roles.find((r) => r.id === a.roleId)) }));
  const tx = {
    post: { findMany: () => Promise.resolve([]) },
    $executeRaw: () => {
      trace.push("role:admin");
      return Promise.resolve(1);
    },
    $queryRaw: (sql: TemplateStringsArray, id: string) => {
      trace.push("row-lock:" + id);
      return Promise.resolve(
        sql.join("").includes("FROM sessions")
          ? db().sessions.filter((s) => s.id === id)
          : db()
              .users.filter((u) => u.id === id)
              .map(({ id }) => ({ id })),
      );
    },
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          db().users.find((u) => u.id === where.id)
            ? { ...db().users.find((u) => u.id === where.id), roles: assignments(where.id) }
            : null,
        ),
      findMany: ({
        where,
      }: {
        where: { id?: { in: string[] }; avatarFileId?: { in: string[] } };
      }) =>
        Promise.resolve(
          db().users.filter((u) =>
            where.id
              ? where.id.in.includes(u.id)
              : u.avatarFileId && where.avatarFileId?.in.includes(u.avatarFileId),
          ),
        ),
      count: () =>
        Promise.resolve(
          db().users.filter(
            (u) =>
              u.status === "active" &&
              assignments(u.id).some((a) => a.role.name === "admin" && a.role.system),
          ).length,
        ),
      update: ({ data }: { data: Partial<typeof user> }) => {
        Object.assign(row(), data);
        return Promise.resolve({ ...row(), roles: assignments(userId) });
      },
    },
    userRole: {
      findMany: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(assignments(where.userId)),
      findFirst: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          assignments(where.userId).find(
            (a) => a.role.name === "admin" && a.role.system && row().status === "active",
          ) ?? null,
        ),
      deleteMany: () => {
        db().assignments = db().assignments.filter((a) => a.userId !== userId);
        return Promise.resolve({ count: 1 });
      },
    },
    role: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(db().roles.filter((r) => where.id.in.includes(r.id))),
    },
    file: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(db().files.find((f) => f.id === where.id) ?? null),
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(db().files.filter((f) => where.id.in.includes(f.id))),
      update: ({ where, data }: { where: { id: string }; data: object }) => {
        const f = required(db().files.find((f) => f.id === where.id));
        Object.assign(f, data);
        return Promise.resolve(f);
      },
      updateMany: ({ where, data }: { where: { id: { in: string[] } }; data: object }) => {
        for (const f of db().files) if (where.id.in.includes(f.id)) Object.assign(f, data);
        return Promise.resolve({ count: 1 });
      },
    },
    session: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(db().sessions.find((s) => s.id === where.id) ?? null),
      findMany: ({ where }: { where: { userId: string; expiresAt?: { gt: Date } } }) =>
        Promise.resolve(
          db().sessions.filter(
            (s) =>
              s.userId === where.userId &&
              !s.revokedAt &&
              (!where.expiresAt || s.expiresAt > where.expiresAt.gt),
          ),
        ),
      updateMany: ({ where, data }: { where: { id: { in: string[] } }; data: object }) => {
        for (const s of db().sessions)
          if (where.id.in.includes(s.id) && !s.revokedAt) Object.assign(s, data);
        return Promise.resolve({ count: 2 });
      },
    },
    oAuthAccount: {
      deleteMany: () => {
        db().oauth = [];
        return Promise.resolve({ count: 1 });
      },
    },
    verificationToken: {
      deleteMany: () => {
        db().tokens = [];
        return Promise.resolve({ count: 1 });
      },
    },
    refreshToken: {
      deleteMany: () => {
        db().refresh = [];
        return Promise.resolve({ count: 2 });
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
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      active = structuredClone(state);
      try {
        const value = await fn(tx);
        if (failCommit) throw new Error("commit 실패");
        state = active;
        trace.push("commit");
        return value;
      } finally {
        active = undefined;
      }
    },
  } as unknown as PrismaService);
  const publisher: RealtimePublisher = {
    queue: (afterCommit, name, rooms, payload) => {
      afterCommit(() => {
        if (active) throw new Error("commit 전 알림이다");
        events.push({ name, rooms, payload: payload() });
      });
    },
  };
  const bridge = new MeRealtimeBridge(publisher);
  bridge.register();
  const sessionBridge = new SessionRealtimeBridge(publisher, {
    publishRecheck: (id: string) => {
      events.push({ name: "recheck", payload: id });
      return Promise.resolve();
    },
  } as never);
  sessionBridge.register();
  const roles = new RolesRepository();
  const users = new UsersRepository();
  const client = new S3Client({
    region: "us-east-1",
    endpoint: "https://assets.example.test",
    forcePathStyle: true,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture-signing" },
  }); // betterleaks:allow 사유: 외부 요청 없는 서명 fixture다
  const files = new FilesService(
    unit,
    new FilesRepository(),
    { internal: client, public: client },
    { S3_BUCKET: "app" } as Settings,
  );
  const sessions = new SessionsService(
    unit,
    new SessionsRepository(),
    new AuthRepository(),
    {} as StrictLimiter,
    {} as Settings,
    {} as OAuthState,
  );
  const settings = { RECENT_LOGIN_SECONDS: 600 } as Settings;
  const includes = new IncludeRegistry();
  includes.register("roles", (tx, ids) => roles.load(tx, ids));
  includes.register("files", (tx, ids, viewer) => files.load(tx, ids, viewer));
  const service = new MeService(unit, users, roles, files, sessions, settings, includes);
  return {
    service,
    unit,
    tx,
    users,
    files,
    includes,
    events,
    trace,
    settings,
    get state() {
      return state;
    },
    set failCommit(value: boolean) {
      failCommit = value;
    },
    close: () => {
      client.destroy();
      bridge.onModuleDestroy();
      sessionBridge.onModuleDestroy();
    },
  };
}

export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error("필수 fixture가 없다");
  return value;
}
