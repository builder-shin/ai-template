import { randomUUID } from "node:crypto";
import { UnitOfWork, type Tx } from "../../../../core/db/unit-of-work.js";
import type { PrismaService } from "../../../../core/db/prisma.service.js";
import type { RedisClients } from "../../../../core/redis/clients.js";
import { settings } from "../../../../core/http/tests/fixtures.js";
import { OAuthClient } from "../../index.js";
import { OAuthState } from "../../index.js";
import { OAuthService } from "../../index.js";
import type { OAuthProvider, ProviderIdentity } from "../../index.js";
import type { AuthUser } from "../../index.js";
export const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
export const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
export const FRONT = "http://localhost:3000/oauth/callback";
export const verifiedIdentity = (email = "ada@example.com"): ProviderIdentity => ({
  subject: "g1",
  email,
  emailVerified: true,
  name: "Ada",
});
export function memoryRedis() {
  const values = new Map<string, { value: string; expires: number }>();
  let clock = 0;
  const redis = {
    prefix: "aitpl:15",
    key: (...parts: string[]) => ["aitpl:15", ...parts].join(":"),
    command: {
      set: (key: string, value: string, unit: string, seconds: number) => {
        if (unit !== "EX") throw new Error("초 단위 만료가 아니다");
        values.set(key, { value, expires: clock + seconds });
        return Promise.resolve("OK");
      },
      getdel: (key: string) => {
        const item = values.get(key);
        values.delete(key);
        return Promise.resolve(item && item.expires > clock ? item.value : null);
      },
    },
  } as unknown as RedisClients;
  return {
    redis,
    values,
    advance: (seconds: number) => {
      clock += seconds;
    },
  };
}
type Link = { provider: string; subject: string; userId: string; email: string | null };
type Data = { users: AuthUser[]; links: Link[]; assignments: { userId: string; roleId: string }[] };
export function oauthFixture() {
  const memory = memoryRedis();
  const store = new OAuthState(memory.redis);
  let committed: Data = { users: [], links: [], assignments: [] };
  let active: Data | undefined;
  let uniqueFailures = 0;
  let otherFailure = false;
  const events: string[] = [];
  const state = () => {
    if (!active) throw new Error("트랜잭션 밖 저장소 접근이다");
    return active;
  };
  const tx = {
    user: {
      findUnique: ({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(
          state().users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ??
            null,
        ),
      create: ({ data }: { data: Partial<AuthUser> }) => {
        const row: AuthUser = {
          id: randomUUID(),
          email: null,
          passwordHash: null,
          emailVerifiedAt: null,
          name: null,
          locale: "ko",
          status: "active",
          createdAt: new Date(),
          ...data,
        };
        state().users.push(row);
        return Promise.resolve(row);
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<AuthUser> }) => {
        const row = state().users.find((u) => u.id === where.id);
        if (!row) throw new Error("사용자가 없다");
        Object.assign(row, data);
        return Promise.resolve(row);
      },
      updateMany: ({ where, data }: { where: { id: string }; data: Partial<AuthUser> }) => {
        const row = state().users.find((u) => u.id === where.id && u.emailVerifiedAt === null);
        if (row) Object.assign(row, data);
        return Promise.resolve({ count: row ? 1 : 0 });
      },
    },
    oAuthAccount: {
      findUnique: ({
        where,
      }: {
        where: { provider_subject: { provider: string; subject: string } };
      }) => {
        const key = where.provider_subject;
        const link = state().links.find(
          (l) => l.provider === key.provider && l.subject === key.subject,
        );
        return Promise.resolve(
          link ? { ...link, user: state().users.find((u) => u.id === link.userId) } : null,
        );
      },
      create: ({ data }: { data: Link }) => {
        if (otherFailure) throw new Error("저장소 실패");
        if (uniqueFailures > 0) {
          uniqueFailures--;
          throw Object.assign(new Error("고유 제약 실패"), { code: "P2002" });
        }
        state().links.push(data);
        return Promise.resolve(data);
      },
    },
    role: { findMany: () => Promise.resolve([{ id: "member-role", name: "member" }]) },
    userRole: {
      createMany: ({ data }: { data: { userId: string; roleId: string }[] }) => {
        state().assignments.push(...data);
        return Promise.resolve({ count: data.length });
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
  let profile: unknown = {
    sub: "g1",
    email: "ada@example.com",
    email_verified: true,
    hd: "example.com",
    name: "Ada",
  };
  let exchangeFailure = false;
  let profileFailure = false;
  const exchanges: { provider: OAuthProvider; code: string; verifier: string }[] = [];
  class FixtureClient extends OAuthClient {
    override authorizeUrl(
      provider: OAuthProvider,
      params: { state: string; codeChallenge: string; redirectUri: string },
    ) {
      const url = new URL("https://provider.example/" + provider);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return url.href;
    }
    override exchange(provider: OAuthProvider, code: string, verifier: string) {
      exchanges.push({ provider, code, verifier });
      return exchangeFailure
        ? Promise.reject(new Error("교환 실패"))
        : Promise.resolve("fixture-access");
    }
    override profile() {
      return profileFailure ? Promise.reject(new Error("조회 실패")) : Promise.resolve(profile);
    }
  }
  const client = new FixtureClient(settings);
  const service = new OAuthService(unit, store, client, settings);
  return {
    service,
    client,
    store,
    unit,
    tx,
    memory,
    events,
    exchanges,
    get data() {
      return committed;
    },
    set profile(value: unknown) {
      profile = value;
    },
    set exchangeFailure(value: boolean) {
      exchangeFailure = value;
    },
    set profileFailure(value: boolean) {
      profileFailure = value;
    },
    set uniqueFailures(value: number) {
      uniqueFailures = value;
    },
    set otherFailure(value: boolean) {
      otherFailure = value;
    },
    addUser(data: Partial<AuthUser> = {}) {
      const row: AuthUser = {
        id: randomUUID(),
        email: "ada@example.com",
        passwordHash: "fixture-password-hash",
        emailVerifiedAt: new Date(),
        name: "기존 회원",
        locale: "ko",
        status: "active",
        createdAt: new Date(),
        ...data,
      }; // betterleaks:allow 사유: 실제 해시가 아닌 메모리 fixture 표식
      committed.users.push(row);
      return row;
    },
    addLink(userId: string, provider = "google", subject = "g1") {
      committed.links.push({ userId, provider, subject, email: null });
    },
  };
}
export async function start(
  f: ReturnType<typeof oauthFixture>,
  provider: OAuthProvider = "google",
) {
  const location = new URL(
    await f.service.authorize(provider, { redirectUri: FRONT, codeChallenge: CHALLENGE }),
  );
  const state = location.searchParams.get("state");
  if (!state) throw new Error("인가 주소에 state가 없다");
  return state;
}
