import { createHash } from "node:crypto";
import type { Settings } from "../../../core/config/settings.js";
import { UnitOfWork, type Tx, type AfterCommit } from "../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../core/db/prisma.service.js";
import { JobQueue } from "../../../core/jobs/queue.js";
import type { JobName } from "../../../core/jobs/names.js";
import type { MailSender } from "../../../core/mail/sender.js";
import type { StrictLimiter } from "../../../core/ratelimit/strict.js";
import type { StrictRule } from "../../../core/ratelimit/rules.js";
import type { RolesRepository } from "../../roles/index.js";
import {
  AuthRepository,
  type AuthUser,
  type NewUser,
  RegistrationService,
  VerificationService,
  AuthMails,
} from "../index.js";
export const at = new Date("2026-10-14T01:00:00.000Z");
export const user: AuthUser = {
  id: "01900000-0000-7000-8000-000000000001",
  email: "member@example.com",
  passwordHash: null,
  name: "<민수>",
  locale: "ko",
  status: "active",
  emailVerifiedAt: null,
  createdAt: at,
};
type Token = { id: string; userId: string; hash: string; expiresAt: Date; purpose: string };
type State = { users: AuthUser[]; tokens: Token[]; roles: string[] };
export function fixture() {
  let committed: State = { users: [], tokens: [], roles: [] };
  let active: State | undefined;
  const events: string[] = [];
  let failure: Error | undefined;
  let mailFailure = false;
  let limitFailure: Error | undefined;
  const state = () => {
    if (!active) throw new Error("저장소는 트랜잭션 안에서만 쓴다");
    return active;
  };
  const unit = new UnitOfWork({
    $transaction: async (fn: (tx: Tx) => Promise<unknown>) => {
      if (active) throw new Error("SMTP나 큐가 트랜잭션을 다시 열었다");
      active = structuredClone(committed);
      events.push("begin");
      try {
        const result = await fn({} as Tx);
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
  class MemoryRepository extends AuthRepository {
    override create(_tx: Tx, input: NewUser): Promise<AuthUser> {
      if (failure) return Promise.reject(failure);
      if (state().users.some((u) => u.email === input.email))
        return Promise.reject(
          Object.assign(new Error("이메일 고유 위반"), {
            code: "P2002",
            meta: { target: ["email"] },
          }),
        );
      const created = { ...structuredClone(user), ...input };
      state().users.push(created);
      return Promise.resolve(created);
    }
    override findByEmail(_tx: Tx, email: string) {
      return Promise.resolve(state().users.find((u) => u.email === email) ?? null);
    }
    override findById(_tx: Tx, id: string) {
      return Promise.resolve(state().users.find((u) => u.id === id) ?? null);
    }
    override lockUser() {
      events.push("lock");
      return Promise.resolve();
    }
    override rotateVerification(_tx: Tx, id: string, hash: string, expiresAt: Date) {
      const current = state();
      current.tokens = current.tokens.filter(
        (t) => t.userId !== id || t.purpose !== "verification",
      );
      current.tokens.push({
        id: "01900000-0000-7000-8000-000000000002",
        userId: id,
        hash,
        expiresAt,
        purpose: "verification",
      });
      return Promise.resolve();
    }
    override consumeVerification(_tx: Tx, hash: string, now: Date) {
      const current = state();
      const index = current.tokens.findIndex(
        (t) => t.hash === hash && t.purpose === "verification" && t.expiresAt > now,
      );
      const token = index < 0 ? undefined : current.tokens.splice(index, 1)[0];
      return Promise.resolve(token);
    }
    override markVerified(_tx: Tx, id: string, now: Date) {
      const found = state().users.find((u) => u.id === id);
      if (!found) throw new Error("사용자가 없다");
      found.emailVerifiedAt = now;
      return Promise.resolve();
    }
  }
  const repository = new MemoryRepository();
  const jobs: { name: string; data: { id: string } }[] = [];
  const queue = {
    enqueue: (afterCommit: AfterCommit, name: JobName, data: { id: string }) => {
      JobQueue.prototype.enqueue.call(queue, afterCommit, name, data);
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
  const roles = {
    assign: (_tx: Tx, id: string, names: readonly string[]) => {
      state().roles.push(...names.map((name) => `${id}:${name}`));
      return Promise.resolve();
    },
  } as RolesRepository;
  const messages: { to: string; subject: string; text: string; html: string }[] = [];
  const sender = {
    send: (message: (typeof messages)[number]) => {
      if (active) throw new Error("SMTP 발송은 commit 뒤다");
      messages.push(message);
      events.push("smtp");
      return mailFailure ? Promise.reject(new Error("SMTP 시험 실패")) : Promise.resolve();
    },
  } as MailSender;
  const settings = {
    IDENTIFIER_HASH_SECRET: "registration-fixture-key",
    FRONTEND_URL: "https://web.example.test/base/",
  } as Settings;
  const registration = new RegistrationService(unit, repository, roles, queue, limiter);
  const verification = new VerificationService(unit, repository, queue, limiter, settings);
  const mails = new AuthMails(unit, repository, sender, settings);
  return {
    registration,
    verification,
    mails,
    events,
    jobs,
    limits,
    messages,
    unit,
    repository,
    queue,
    limiter,
    sender,
    roles,
    get state() {
      return committed;
    },
    addUser(overrides: Partial<AuthUser> = {}) {
      committed.users.push({ ...structuredClone(user), ...overrides });
    },
    addToken(token: string, overrides: Partial<Token> = {}) {
      committed.tokens.push({
        id: "01900000-0000-7000-8000-000000000002",
        userId: user.id,
        hash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date("2026-10-15T01:00:00Z"),
        purpose: "verification",
        ...overrides,
      });
    },
    set failure(value: Error) {
      failure = value;
    },
    set mailFailure(value: boolean) {
      mailFailure = value;
    },
    set limitFailure(value: Error) {
      limitFailure = value;
    },
  };
}
