import { randomUUID } from "node:crypto";
import { UnitOfWork, type Tx } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { Settings } from "../../../core/config/settings.js";
import type { StrictLimiter } from "../../../core/ratelimit/strict.js";
import type { StrictRule } from "../../../core/ratelimit/rules.js";
import { RolesRepository } from "../../roles/index.js";
import type { ParsedQuery } from "../../../core/jsonapi/query.js";
import {
  OAuthState,
  AuthRepository,
  type AuthUser,
  SessionsRepository,
  type SessionRow,
  type RefreshRow,
  SessionsService,
  JwtPrincipalResolver,
} from "../index.js";
import { memoryRedis } from "../oauth/tests/fixtures.js";
export const now = new Date("2026-10-14T01:00:00.000Z");
export const userId = "01900000-0000-7000-8000-000000000001";
export const settings = {
  JWT_SECRET: "session-fixture-signing-key", // betterleaks:allow 사유: 메모리 단위 시험의 가짜 서명 키
  IDENTIFIER_HASH_SECRET: "session-fixture-identifier-key", // betterleaks:allow 사유: 메모리 단위 시험의 가짜 해시 키
} as Settings;
type State = {
  users: AuthUser[];
  sessions: SessionRow[];
  refresh: RefreshRow[];
  audits: object[];
  loginAt: Date | null;
};
export function sessionFixture(oauth = new OAuthState(memoryRedis().redis)) {
  let committed: State = { users: [], sessions: [], refresh: [], audits: [], loginAt: null };
  let active: State | undefined;
  let failAudit = false;
  let userChangeOnLock: Partial<AuthUser> = {};
  let consumeRefreshOnLock = false;
  const events: string[] = [];
  const state = () => {
    if (!active) throw new Error("트랜잭션 밖 저장소 접근이다");
    return active;
  };
  const tx = {
    auditLog: {
      create: ({ data }: { data: object }) => {
        if (failAudit) throw new Error("감사 저장 실패");
        state().audits.push(data);
        events.push("audit");
        return Promise.resolve();
      },
    },
  } as unknown as Tx;
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      active = structuredClone(committed);
      events.push("begin");
      try {
        const result = await fn(tx);
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
  class MemoryAuth extends AuthRepository {
    override findByEmail(_tx: Tx, email: string) {
      return Promise.resolve(structuredClone(state().users.find((u) => u.email === email) ?? null));
    }
    override findById(_tx: Tx, id: string) {
      events.push("find:user");
      return Promise.resolve(state().users.find((u) => u.id === id) ?? null);
    }
    override lockUser(_tx: Tx, id: string) {
      events.push("lock:user");
      const user = state().users.find((u) => u.id === id);
      if (user) Object.assign(user, userChangeOnLock);
      return Promise.resolve();
    }
  }
  class MemorySessions extends SessionsRepository {
    override create(
      _tx: Tx,
      input: { userId: string; at: Date; expiresAt: Date; userAgent?: string },
    ) {
      events.push("session:create");
      const row: SessionRow = {
        id: randomUUID(),
        userId: input.userId,
        authenticatedAt: input.at,
        createdAt: input.at,
        lastUsedAt: input.at,
        expiresAt: input.expiresAt,
        revokedAt: null,
        revokedReason: null,
        userAgent: input.userAgent ?? null,
      };
      state().sessions.push(row);
      return Promise.resolve(row);
    }
    override find(_tx: Tx, id: string) {
      return Promise.resolve(state().sessions.find((s) => s.id === id) ?? null);
    }
    override lock(tx: Tx, id: string) {
      events.push("lock");
      if (consumeRefreshOnLock)
        for (const token of state().refresh) if (token.sessionId === id) token.usedAt = now;
      return this.find(tx, id).then((s) => s ?? undefined);
    }
    override findRefresh(_tx: Tx, hash: string) {
      events.push("findRefresh");
      return Promise.resolve(
        structuredClone(state().refresh.find((t) => t.tokenHash === hash) ?? null),
      );
    }
    override addRefresh(_tx: Tx, sessionId: string, tokenHash: string, expiresAt: Date) {
      state().refresh.push({ id: randomUUID(), sessionId, tokenHash, expiresAt, usedAt: null });
      return Promise.resolve();
    }
    override consumeRefresh(_tx: Tx, id: string, at: Date) {
      const token = state().refresh.find((t) => t.id === id);
      if (token) token.usedAt = at;
      return Promise.resolve();
    }
    override touch(_tx: Tx, id: string, at: Date, expiresAt: Date) {
      const s = state().sessions.find((s) => s.id === id);
      if (s) Object.assign(s, { lastUsedAt: at, expiresAt });
      return Promise.resolve();
    }
    override revoke(_tx: Tx, ids: readonly string[], at: Date, reason: string) {
      for (const s of state().sessions)
        if (ids.includes(s.id) && !s.revokedAt)
          Object.assign(s, { revokedAt: at, revokedReason: reason });
      return Promise.resolve();
    }
    override active(_tx: Tx, id: string, at: Date, query?: ParsedQuery) {
      const rows = state().sessions.filter(
        (s) => s.userId === id && !s.revokedAt && s.expiresAt > at,
      );
      for (const sort of [...(query?.sort ?? [])].reverse())
        rows.sort((a, b) => {
          const field = sort.field as "createdAt" | "lastUsedAt";
          return (a[field].getTime() - b[field].getTime()) * (sort.descending ? -1 : 1);
        });
      return Promise.resolve(rows);
    }
    override unrevoked(_tx: Tx, id: string) {
      return Promise.resolve(
        state()
          .sessions.filter((s) => s.userId === id && !s.revokedAt)
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
    }
    override loginAt(_tx: Tx, _id: string, at: Date) {
      state().loginAt = at;
      return Promise.resolve();
    }
  }
  const limits: [StrictRule, string][] = [];
  let limitFailure: Error | undefined;
  const limiter = {
    enforce: (rule: StrictRule, subject: string) => {
      limits.push([rule, subject]);
      return limitFailure ? Promise.reject(limitFailure) : Promise.resolve();
    },
  } as StrictLimiter;
  class MemoryRoles extends RolesRepository {
    override permissionsOf(_tx: Tx, id: string) {
      state();
      if (id !== userId) throw new Error("다른 사용자의 권한을 조회했다");
      return Promise.resolve(new Set(["posts:create"] as const));
    }
  }
  const roles = new MemoryRoles();
  const auth = new MemoryAuth();
  const repository = new MemorySessions();
  const service = new SessionsService(unit, repository, auth, limiter, settings, oauth);
  const resolver = new JwtPrincipalResolver(unit, repository, auth, roles, settings);
  return {
    service,
    resolver,
    repository,
    events,
    limits,
    unit,
    get state() {
      return committed;
    },
    get inTransaction() {
      return active !== undefined;
    },
    set failAudit(value: boolean) {
      failAudit = value;
    },
    set userChangeOnLock(value: Partial<AuthUser>) {
      userChangeOnLock = value;
    },
    set consumeRefreshOnLock(value: boolean) {
      consumeRefreshOnLock = value;
    },
    set limitFailure(value: Error) {
      limitFailure = value;
    },
    addUser(overrides: Partial<AuthUser> = {}) {
      committed.users.push({
        id: userId,
        email: "member@example.com",
        passwordHash: null,
        name: "회원",
        locale: "ko",
        status: "active",
        emailVerifiedAt: now,
        createdAt: now,
        ...overrides,
      });
    },
    addSession(overrides: Partial<SessionRow> = {}) {
      const row = {
        id: randomUUID(),
        userId,
        authenticatedAt: now,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date("2026-11-13T01:00:00Z"),
        revokedAt: null,
        revokedReason: null,
        userAgent: null,
        ...overrides,
      };
      committed.sessions.push(row);
      return row;
    },
  };
}
