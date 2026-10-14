import { UnitOfWork, type Tx } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import { IncludeRegistry } from "../../../core/jsonapi/include.js";
import type { Principal } from "../../../core/security/principal.js";
import { PERMISSION_CODES } from "../../../core/security/permissions.js";
import type { ControlChannel } from "../../../core/realtime/control-channel.js";
import type { RealtimePublisher } from "../../../core/realtime/publisher.js";
import { SessionsService, SessionsRepository, AuthRepository } from "../../auth/index.js";
import { SessionRealtimeBridge } from "../../realtime/index.js";
import { RolesRepository } from "../../roles/index.js";
import { MeRealtimeBridge, UsersRepository } from "../index.js";
import { z } from "zod";
export const at = new Date("2026-10-15T00:00:00Z");
export const uid = "01900000-0000-7000-8000-000000000001";
export const otherId = "01900000-0000-7000-8000-000000000002";
export const adminId = "01900000-0000-7000-8000-000000000003";
export const memberId = "01900000-0000-7000-8000-000000000004";
export const customId = "01900000-0000-7000-8000-000000000005";
export const admin: Principal = {
  userId: uid,
  sessionId: "s1",
  permissions: new Set(PERMISSION_CODES),
};
type Row = Record<string, unknown>;
const record = (v: unknown): Row => (v !== null && typeof v === "object" ? (v as Row) : {});
const scalar = (v: unknown): string | number =>
  v instanceof Date ? v.getTime() : typeof v === "number" || typeof v === "string" ? v : "";
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
    if (key === "AND") return (value as Row[]).every((part) => matches(row, part));
    const actual = row[key];
    if (value === null || typeof value !== "object" || value instanceof Date)
      return actual === value;
    const rule = record(value);
    if ("in" in rule) return (rule.in as unknown[]).includes(actual);
    if ("notIn" in rule) return !(rule.notIn as unknown[]).includes(actual);
    if ("contains" in rule)
      return (
        typeof actual === "string" &&
        actual.toLowerCase().includes(String(rule.contains).toLowerCase())
      );
    if ("some" in rule) return (actual as Row[]).some((r) => matches(r, record(rule.some)));
    if ("gt" in rule && !(scalar(actual) > scalar(rule.gt))) return false;
    if ("gte" in rule && !(scalar(actual) >= scalar(rule.gte))) return false;
    if ("lt" in rule && !(scalar(actual) < scalar(rule.lt))) return false;
    if ("gt" in rule || "gte" in rule || "lt" in rule) return true;
    return matches(record(actual), rule);
  });
}
export function adminFixture() {
  const user = (id: string, name: string, email: string) => ({
    id,
    name,
    email,
    locale: "ko",
    status: "active",
    passwordHash: null,
    avatarFileId: null,
    emailVerifiedAt: at,
    lastLoginAt: null,
    createdAt: at,
    updatedAt: at,
  });
  let state = {
    users: [
      user(uid, "관리자", "admin@example.test"),
      user(otherId, "회원", "member@example.test"),
    ],
    roles: [
      {
        id: adminId,
        name: "admin",
        system: true,
        permissions: [],
        description: null,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: memberId,
        name: "member",
        system: true,
        permissions: ["posts:create"],
        description: null,
        createdAt: at,
        updatedAt: at,
      },
      {
        id: customId,
        name: "writer",
        system: false,
        permissions: ["posts:create"],
        description: "작가",
        createdAt: at,
        updatedAt: at,
      },
    ],
    assignments: [
      { userId: uid, roleId: adminId },
      { userId: otherId, roleId: memberId },
    ],
    sessions: ["s2", "s3"].map((id) => ({
      id,
      userId: otherId,
      authenticatedAt: at,
      createdAt: at,
      lastUsedAt: at,
      expiresAt: new Date("2099-01-01"),
      revokedAt: null as Date | null,
      revokedReason: null as string | null,
      userAgent: null,
    })),
    audits: [] as Row[],
  };
  let active: typeof state | undefined;
  let failCommit = false;
  const db = () => active ?? state;
  const trace: unknown[] = [];
  const events: { name: string; userId?: string; payload?: unknown; rooms?: readonly string[] }[] =
    [];
  function rows(table: "users" | "roles" | "assignments" | "sessions" | "audits"): Row[] {
    return db()[table].map((r) => {
      if (table === "assignments")
        return {
          ...r,
          role: db().roles.find((role) => role.id === record(r).roleId),
          user: db().users.find((u) => u.id === record(r).userId),
        };
      if (table === "users")
        return { ...r, roles: rows("assignments").filter((a) => a.userId === record(r).id) };
      return r;
    });
  }
  function delegate(table: "users" | "roles" | "assignments" | "sessions" | "audits") {
    const findMany = (
      input: { where?: Row; orderBy?: Row | Row[]; skip?: number; take?: number } = {},
    ) => {
      const ids = record(input.where?.id).in;
      if (
        table === "roles" &&
        Array.isArray(ids) &&
        ids.some((id: unknown) => typeof id !== "string" || !z.regexes.uuid().test(id))
      )
        throw new Error("DB의 UUID 입력 형식이 잘못됐다");
      trace.push({ table, query: input });
      let found = rows(table).filter((r) => matches(r, input.where ?? {}));
      const order = Array.isArray(input.orderBy)
        ? input.orderBy
        : input.orderBy
          ? [input.orderBy]
          : [];
      found.sort((a, b) => {
        for (const part of order)
          for (const [key, direction] of Object.entries(part)) {
            const av = scalar(a[key]),
              bv = scalar(b[key]);
            if (av !== bv) return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
          }
        return 0;
      });
      if (input.skip !== undefined || input.take !== undefined)
        found = found.slice(
          input.skip ?? 0,
          input.take === undefined ? undefined : (input.skip ?? 0) + input.take,
        );
      return Promise.resolve(found);
    };
    return {
      findMany,
      findUnique: async ({ where }: { where: Row }) => (await findMany({ where }))[0] ?? null,
      findFirst: async ({ where }: { where: Row }) => (await findMany({ where }))[0] ?? null,
      count: async ({ where }: { where: Row }) => (await findMany({ where })).length,
      update: ({ where, data }: { where: Row; data: Row }) => {
        const row = (db()[table] as Row[]).find((r) => matches(r, where));
        if (!row) throw new Error("수정할 fixture 행이 없다");
        Object.assign(row, data, { updatedAt: new Date(at.getTime() + 1000) });
        return Promise.resolve({ ...row });
      },
      updateMany: ({ where, data }: { where: Row; data: Row }) => {
        const found = (db()[table] as Row[]).filter((r) => matches(r, where));
        for (const row of found) Object.assign(row, data);
        return Promise.resolve({ count: found.length });
      },
      deleteMany: ({ where }: { where: Row }) => {
        const array = db()[table] as Row[];
        let count = 0;
        for (let i = array.length - 1; i >= 0; i--)
          if (matches(array[i] ?? {}, where)) {
            array.splice(i, 1);
            count++;
          }
        return Promise.resolve({ count });
      },
      createMany: ({ data }: { data: Row[] }) => {
        (db()[table] as Row[]).push(...data);
        return Promise.resolve({ count: data.length });
      },
      create: ({ data }: { data: Row }) => {
        if (table === "roles" && db().roles.some((r) => r.name === data.name))
          throw Object.assign(new Error("역할 이름이 중복된다"), {
            code: "P2002",
            meta: { target: ["name"] },
          });
        const row = {
          id: customId + "-new",
          system: false,
          description: null,
          createdAt: at,
          updatedAt: at,
          ...data,
        };
        (db()[table] as Row[]).push(row);
        return Promise.resolve(row);
      },
      delete: ({ where }: { where: Row }) => {
        const array = db()[table] as Row[],
          i = array.findIndex((r) => matches(r, where));
        if (i < 0) throw new Error("지울 fixture 행이 없다");
        return Promise.resolve(array.splice(i, 1)[0]);
      },
    };
  }
  const tx = {
    user: delegate("users"),
    role: delegate("roles"),
    userRole: delegate("assignments"),
    session: delegate("sessions"),
    auditLog: delegate("audits"),
    $executeRaw: (sql: TemplateStringsArray, ...values: unknown[]) => {
      trace.push({ sql: sql.join("?"), values });
      return Promise.resolve(1);
    },
    $queryRaw: (sql: TemplateStringsArray, id: string) => {
      trace.push({ sql: sql.join("?"), id });
      return Promise.resolve(
        sql.join("").includes("FROM sessions")
          ? db().sessions.filter((s) => s.id === id)
          : db().users.filter((u) => u.id === id),
      );
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
    queue: (after, name, rooms, payload) => {
      after(() => {
        if (active) throw new Error("commit 전 알림이다");
        events.push({ name, rooms, payload: payload() });
      });
    },
  };
  const control = {
    publishRecheck: (userId: string) => {
      if (active) throw new Error("commit 전 재검사다");
      events.push({ name: "recheck", userId });
      return Promise.resolve();
    },
  } as ControlChannel;
  const bridge = new MeRealtimeBridge(publisher);
  bridge.register();
  const sessionsBridge = new SessionRealtimeBridge(publisher, control);
  sessionsBridge.register();
  const roles = new RolesRepository(),
    users = new UsersRepository();
  const sessions = new SessionsService(
    unit,
    new SessionsRepository(),
    new AuthRepository(),
    {} as never,
    {} as never,
    {} as never,
  );
  const includes = new IncludeRegistry();
  includes.register("roles", (tx, ids) => roles.load(tx, ids));
  includes.register("users", (tx, ids) => users.load(tx, ids));
  return {
    unit,
    tx,
    roles,
    users,
    sessions,
    includes,
    control,
    trace,
    events,
    get state() {
      return state;
    },
    set failCommit(v: boolean) {
      failCommit = v;
    },
    close: () => {
      bridge.onModuleDestroy();
      sessionsBridge.onModuleDestroy();
    },
  };
}
