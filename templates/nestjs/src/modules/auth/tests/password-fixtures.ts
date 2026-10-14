import { createHash, randomUUID } from "node:crypto";
import { UnitOfWork, type Tx, type AfterCommit } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import type { StrictLimiter } from "../../../core/ratelimit/strict.js";
import type { StrictRule } from "../../../core/ratelimit/rules.js";
import type { Settings } from "../../../core/config/settings.js";
import type { MailSender } from "../../../core/mail/sender.js";
import { JobQueue } from "../../../core/jobs/queue.js";
import type { JobName } from "../../../core/jobs/names.js";
import {
  AuthRepository,
  type AuthUser,
  SessionsRepository,
  type SessionRow,
  SessionsService,
  PasswordsService,
  AuthMails,
} from "../index.js";
export const now = new Date("2026-10-14T01:00:00Z");
export const userId = "01900000-0000-7000-8000-000000000001";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
type Token = {
  id: string;
  userId: string;
  tokenHash: string;
  purpose: "reset" | "verification";
  expiresAt: Date;
};
type State = {
  users: AuthUser[];
  sessions: SessionRow[];
  tokens: Token[];
  refresh: { sessionId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }[];
  audits: object[];
};
export function passwordFixture() {
  let committed: State = { users: [], sessions: [], tokens: [], refresh: [], audits: [] };
  let active: State | undefined;
  let failAudit = false;
  let failMail = false;
  let limitFailure: Error | undefined;
  const events: string[] = [];
  const state = () => {
    if (!active) throw new Error("트랜잭션 밖 저장소 접근이다");
    return active;
  };
  const tx = {
    refreshToken: {
      deleteMany: ({ where }: { where: { expiresAt: { lte: Date } } }) => {
        const before = state().refresh.length;
        state().refresh = state().refresh.filter((t) => t.expiresAt > where.expiresAt.lte);
        return Promise.resolve({ count: before - state().refresh.length });
      },
    },
    user: {
      findUnique: ({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          state().users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ??
            null,
        ),
      update: ({ where, data }: { where: { id: string }; data: Partial<AuthUser> }) => {
        const user = state().users.find((u) => u.id === where.id);
        if (!user) throw new Error("사용자가 없다");
        Object.assign(user, data);
        return Promise.resolve(user);
      },
    },
    verificationToken: {
      findUnique: ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(state().tokens.find((t) => t.tokenHash === where.tokenHash) ?? null),
      create: ({ data }: { data: Omit<Token, "id"> }) => {
        const token = { ...data, id: randomUUID() };
        state().tokens.push(token);
        return Promise.resolve(token);
      },
      deleteMany: ({
        where,
      }: {
        where: { userId?: string; purpose?: string; expiresAt?: { lte: Date } };
      }) => {
        const before = state().tokens.length;
        state().tokens = state().tokens.filter(
          (t) =>
            !(where.expiresAt
              ? t.expiresAt <= where.expiresAt.lte
              : t.userId === where.userId && t.purpose === where.purpose),
        );
        return Promise.resolve({ count: before - state().tokens.length });
      },
    },
    session: {
      findMany: ({ where }: { where: { userId: string; expiresAt: { gt: Date } } }) =>
        Promise.resolve(
          state().sessions.filter(
            (s) => s.userId === where.userId && !s.revokedAt && s.expiresAt > where.expiresAt.gt,
          ),
        ),
      updateMany: ({
        where,
        data,
      }: {
        where: { id: { in: string[] } };
        data: Partial<SessionRow>;
      }) => {
        for (const s of state().sessions)
          if (where.id.in.includes(s.id) && !s.revokedAt) Object.assign(s, data);
        return Promise.resolve({ count: where.id.in.length });
      },
      deleteMany: ({
        where,
      }: {
        where: { OR: { expiresAt?: { lte: Date }; revokedAt?: { not: null } }[] };
      }) => {
        const before = state().sessions.length;
        state().sessions = state().sessions.filter(
          (s) =>
            !where.OR.some(
              (w) =>
                (w.expiresAt && s.expiresAt <= w.expiresAt.lte) ||
                (w.revokedAt && s.revokedAt !== null),
            ),
        );
        return Promise.resolve({ count: before - state().sessions.length });
      },
    },
    auditLog: {
      create: ({ data }: { data: object }) => {
        if (failAudit) throw new Error("감사 저장 실패");
        state().audits.push(data);
        return Promise.resolve(data);
      },
    },
    $executeRaw: () => {
      events.push("user-lock");
      return Promise.resolve(1);
    },
    $queryRaw: (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?");
      if (text.includes("FROM sessions")) {
        events.push("session-lock");
        const session = state().sessions.find((s) => s.id === values[0]);
        return Promise.resolve(session ? [session] : []);
      }
      if (
        !text.includes("DELETE FROM verification_tokens") ||
        !text.includes("purpose = 'reset'") ||
        !text.includes("expires_at >") ||
        !text.includes("RETURNING")
      )
        throw new Error("재설정 토큰은 목적·만료를 확인하고 한 번 소비한다");
      const index = state().tokens.findIndex(
        (t) =>
          t.tokenHash === values[0] && t.purpose === "reset" && t.expiresAt > (values[1] as Date),
      );
      return Promise.resolve(index < 0 ? [] : state().tokens.splice(index, 1));
    },
  } as unknown as Tx;
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      if (active) throw new Error("트랜잭션이 중첩됐다");
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
  const jobs: { name: string; data: { id: string } }[] = [];
  const queue = {
    enqueue: (after: AfterCommit, name: JobName, data: { id: string }) => {
      JobQueue.prototype.enqueue.call(queue, after, name, data);
    },
    queue: {
      add: (name: string, data: { id: string }) => {
        if (active) throw new Error("큐 등록은 commit 뒤다");
        jobs.push({ name, data });
        events.push("enqueue");
        return Promise.resolve();
      },
    },
  } as unknown as JobQueue;
  const limits: [StrictRule, string][] = [];
  const limiter = {
    enforce: (rule: StrictRule, subject: string) => {
      limits.push([rule, subject]);
      return limitFailure ? Promise.reject(limitFailure) : Promise.resolve();
    },
  } as StrictLimiter;
  const messages: { to: string; subject: string; text: string; html: string }[] = [];
  const sender = {
    send: (message: (typeof messages)[number]) => {
      if (active) throw new Error("SMTP 발송은 commit 뒤다");
      messages.push(message);
      events.push("smtp");
      return failMail ? Promise.reject(new Error("SMTP 시험 실패")) : Promise.resolve();
    },
  } as MailSender;
  const settings = {
    IDENTIFIER_HASH_SECRET: "password-fixture-identifier-key", // betterleaks:allow 사유: 메모리 시험의 가짜 해시 키
    FRONTEND_URL: "https://web.example.test/base/",
  } as Settings;
  const auth = new AuthRepository();
  const sessions = new SessionsService(unit, new SessionsRepository(), auth, limiter, settings);
  const service = new PasswordsService(unit, auth, sessions, queue, limiter, settings);
  return {
    service,
    unit,
    tx,
    queue,
    jobs,
    limits,
    events,
    messages,
    mails: new AuthMails(unit, auth, sender, settings),
    get state() {
      return committed;
    },
    get inTransaction() {
      return active !== undefined;
    },
    set failAudit(value: boolean) {
      failAudit = value;
    },
    set failMail(value: boolean) {
      failMail = value;
    },
    set limitFailure(value: Error) {
      limitFailure = value;
    },
    addUser(overrides: Partial<AuthUser> = {}) {
      committed.users.push({
        id: userId,
        email: "member@example.com",
        passwordHash: null,
        name: "<회원>",
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
    addRefresh(sessionId: string, expiresAt: Date) {
      committed.refresh.push({
        sessionId,
        tokenHash: tokenHash(randomUUID()),
        expiresAt,
        usedAt: null,
      });
    },
    addToken(token: string, overrides: Partial<Token> = {}) {
      const row: Token = {
        id: randomUUID(),
        userId,
        tokenHash: tokenHash(token),
        purpose: "reset",
        expiresAt: new Date("2026-10-14T02:00:00Z"),
        ...overrides,
      };
      committed.tokens.push(row);
      return row;
    },
  };
}
