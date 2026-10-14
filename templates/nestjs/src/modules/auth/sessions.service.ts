import { OAuthState } from "./oauth/state.js";
import { verifiesCodeChallenge } from "./oauth/pkce.js";
import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { UnitOfWork, type Tx, type AfterCommit } from "../../core/db/unit-of-work.js";
import { StrictLimiter } from "../../core/ratelimit/strict.js";
import { verifyPassword, dummyVerify } from "../../core/security/passwords.js";
import { normalizeEmail, hashIdentifier } from "../../core/security/identifier.js";
import { newOpaqueToken } from "../../core/security/tokens.js";
import {
  signAccessToken,
  tokenError,
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_DAYS,
} from "../../core/security/jwt.js";
import type { Principal } from "../../core/security/principal.js";
import { recordAudit } from "../../core/audit/record.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { collectionDocument } from "../../core/jsonapi/document.js";
import type { ParsedQuery } from "../../core/jsonapi/query.js";
import { AuthRepository } from "./repository.js";
import { SessionsRepository, type SessionRow } from "./sessions.repository.js";
import { sessionsRevoked, type SessionRevokedReason } from "./session-events.js";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const expiresAt = (at: Date) => new Date(at.getTime() + REFRESH_TOKEN_DAYS * 86400000);
@Injectable()
export class SessionsService {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(SessionsRepository) private readonly repository: SessionsRepository,
    @Inject(AuthRepository) private readonly auth: AuthRepository,
    @Inject(StrictLimiter) private readonly limiter: StrictLimiter,
    @Inject(SETTINGS) private readonly settings: Settings,
    @Inject(OAuthState) private readonly oauth: OAuthState,
  ) {}
  async createWithOAuthCode(
    input: { code: string; codeVerifier: string },
    client: { ip: string; userAgent?: string },
  ) {
    const invalid = () =>
      new ApiError({
        status: 401,
        code: "auth.oauth_code_invalid",
        title: "소셜 로그인 코드가 올바르지 않다",
        headers: { "WWW-Authenticate": "Bearer" },
      });
    const code = await this.oauth.consumeCode(input.code);
    if (!code || !verifiesCodeChallenge(code.codeChallenge, input.codeVerifier)) throw invalid();
    return this.unit.run(async (tx) => {
      const user = await this.auth.findById(tx, code.userId);
      if (!user) throw invalid();
      if (user.status !== "active")
        throw new ApiError({
          status: 403,
          code: "auth.account_deactivated",
          title: "비활성 계정이다",
        });
      const at = new Date();
      const session = await this.repository.create(tx, {
        userId: user.id,
        at,
        expiresAt: expiresAt(at),
        ...client,
      });
      const document = await this.issue(tx, session, at);
      await this.repository.loginAt(tx, user.id, at);
      await recordAudit(tx, {
        action: "session.login_succeeded",
        actorUserId: user.id,
        target: { type: "sessions", id: session.id },
        meta: { method: "oauth", provider: code.provider },
      });
      return document;
    });
  }
  async createWithPassword(
    input: { email: string; password: string },
    client: { ip: string; userAgent?: string },
  ) {
    const email = normalizeEmail(input.email);
    const identifierHash = hashIdentifier(email, this.settings.IDENTIFIER_HASH_SECRET);
    await this.limiter.enforce("login.ip", client.ip);
    await this.limiter.enforce("login.identifier", identifierHash);
    const result = await this.unit.run(async (tx) => {
      const user = await this.auth.findByEmail(tx, email);
      let valid = false;
      if (user?.passwordHash) valid = await verifyPassword(user.passwordHash, input.password);
      else await dummyVerify(input.password);
      const failure =
        !valid || !user
          ? "auth.invalid_credentials"
          : user.status !== "active"
            ? "auth.account_deactivated"
            : !user.emailVerifiedAt
              ? "auth.email_not_verified"
              : undefined;
      if (failure) {
        await recordAudit(tx, { action: "session.login_failed", identifierHash });
        return {
          error: new ApiError({
            status: failure === "auth.invalid_credentials" ? 401 : 403,
            code: failure,
            title: "Login failed",
            ...(failure === "auth.invalid_credentials"
              ? { headers: { "WWW-Authenticate": "Bearer" } }
              : {}),
          }),
        };
      }
      if (!user) throw new Error("인증된 사용자가 없다");
      const at = new Date();
      const session = await this.repository.create(tx, {
        userId: user.id,
        at,
        expiresAt: expiresAt(at),
        ...client,
      });
      const document = await this.issue(tx, session, at);
      await this.repository.loginAt(tx, user.id, at);
      await recordAudit(tx, {
        action: "session.login_succeeded",
        actorUserId: user.id,
        target: { type: "sessions", id: session.id },
      });
      return { document };
    });
    if (result.error) throw result.error;
    return result.document;
  }
  async refresh(refreshToken: string) {
    const hash = hashToken(refreshToken);
    const result = await this.unit.run(async (tx, afterCommit) => {
      const candidate = await this.repository.findRefresh(tx, hash);
      if (!candidate) return { error: tokenError() };
      const session = await this.repository.lock(tx, candidate.sessionId);
      const at = new Date();
      if (!session || session.revokedAt || session.expiresAt <= at) return { error: tokenError() };
      // 같은 세션 잠금을 얻은 뒤 다시 읽어 앞선 회전의 usedAt을 본다.
      const token = await this.repository.findRefresh(tx, hash);
      if (!token || token.expiresAt <= at) return { error: tokenError() };
      if (token.usedAt) {
        await this.revokeLocked(tx, afterCommit, session, at, "refresh_token_reused");
        return { error: tokenError("auth.refresh_token_reused") };
      }
      const user = await this.auth.findById(tx, session.userId);
      if (!user || user.status !== "active") return { error: tokenError() };
      await this.repository.consumeRefresh(tx, token.id, at);
      await this.repository.touch(tx, session.id, at, expiresAt(at));
      return {
        document: await this.issue(
          tx,
          { ...session, lastUsedAt: at, expiresAt: expiresAt(at) },
          at,
        ),
      };
    });
    if (result.error) throw result.error;
    return result.document;
  }
  list(principal: Principal, query: ParsedQuery, search?: string) {
    return this.unit.run(async (tx) => {
      const rows = await this.repository.active(tx, principal.userId, new Date(), query);
      const offset = (query.page.number - 1) * query.page.size;
      const raw = new URLSearchParams();
      if (query.sort.length)
        raw.set("sort", query.sort.map((s) => (s.descending ? "-" : "") + s.field).join(","));
      raw.set("page[size]", String(query.page.size));
      const data = rows.slice(offset, offset + query.page.size).map((s) => {
        const resource = sessionResource(s, principal.sessionId);
        const fields = query.fields.sessions;
        return fields === undefined
          ? resource
          : {
              type: resource.type,
              id: resource.id,
              attributes: Object.fromEntries(
                Object.entries(resource.attributes).filter(([key]) => fields.includes(key)),
              ),
              ...(fields.includes("user") ? { relationships: resource.relationships } : {}),
            };
      });
      return collectionDocument(data, {
        total: rows.length,
        page: query.page,
        path: "/api/v1/sessions",
        search: search ?? raw.toString(),
      });
    });
  }
  revokeCurrent(principal: Principal): Promise<void> {
    return this.revokeOne(principal, principal.sessionId, "logout");
  }
  revoke(principal: Principal, id: string): Promise<void> {
    return this.revokeOne(principal, id, "revoked");
  }
  private revokeOne(principal: Principal, id: string, reason: SessionRevokedReason): Promise<void> {
    return this.unit.run(async (tx, afterCommit) => {
      const session = await this.repository.lock(tx, id);
      if (!session || session.userId !== principal.userId)
        throw new ApiError({ status: 404, code: "resource.not_found", title: "Not found" });
      if (!session.revokedAt) await this.revokeLocked(tx, afterCommit, session, new Date(), reason);
    });
  }
  revokeOthers(principal: Principal): Promise<number> {
    return this.revokeMany(principal, "others");
  }
  revokeAll(principal: Principal): Promise<number> {
    return this.revokeMany(principal, "all");
  }
  async revokeForPassword(
    tx: Tx,
    afterCommit: AfterCommit,
    userId: string,
    at: Date,
    reason: "password_reset" | "password_changed",
    keepSessionId?: string,
  ): Promise<void> {
    await this.revokeActive(tx, afterCommit, userId, at, reason, keepSessionId);
  }
  async revokeForAccountDeletion(
    tx: Tx,
    afterCommit: AfterCommit,
    userId: string,
    at: Date,
  ): Promise<void> {
    const ids: string[] = [];
    for (const candidate of await this.repository.unrevoked(tx, userId)) {
      const session = await this.repository.lock(tx, candidate.id);
      if (session && !session.revokedAt) ids.push(session.id);
    }
    await this.repository.revoke(tx, ids, at, "account_deleted");
    if (ids.length)
      sessionsRevoked(afterCommit, { userId, sessionIds: ids, reason: "account_deleted" });
  }
  async revokeForDeactivation(
    tx: Tx,
    afterCommit: AfterCommit,
    userId: string,
    at: Date,
  ): Promise<void> {
    await this.revokeActive(tx, afterCommit, userId, at, "account_deactivated");
  }
  private revokeMany(principal: Principal, scope: "others" | "all"): Promise<number> {
    return this.unit.run(async (tx, afterCommit) => {
      const at = new Date();
      const sessionIds = await this.revokeActive(
        tx,
        afterCommit,
        principal.userId,
        at,
        "revoked",
        scope === "others" ? principal.sessionId : undefined,
      );
      await recordAudit(tx, {
        action: "session.all_revoked",
        actorUserId: principal.userId,
        meta: { scope, revokedCount: sessionIds.length },
      });
      return sessionIds.length;
    });
  }
  private async revokeActive(
    tx: Tx,
    afterCommit: AfterCommit,
    userId: string,
    at: Date,
    reason: SessionRevokedReason,
    keepSessionId?: string,
  ): Promise<string[]> {
    const candidates = (await this.repository.active(tx, userId, at))
      .filter((s) => s.id !== keepSessionId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const sessionIds: string[] = [];
    for (const candidate of candidates) {
      const session = await this.repository.lock(tx, candidate.id);
      if (session && !session.revokedAt && session.expiresAt > at) sessionIds.push(session.id);
    }
    await this.repository.revoke(tx, sessionIds, at, reason);
    if (sessionIds.length) sessionsRevoked(afterCommit, { userId, sessionIds, reason });
    return sessionIds;
  }
  private async revokeLocked(
    tx: Tx,
    afterCommit: AfterCommit,
    session: SessionRow,
    at: Date,
    reason: SessionRevokedReason,
  ) {
    await this.repository.revoke(tx, [session.id], at, reason);
    sessionsRevoked(afterCommit, { userId: session.userId, sessionIds: [session.id], reason });
  }
  private async issue(tx: Tx, session: SessionRow, at: Date) {
    const { token: refreshToken, hash } = newOpaqueToken();
    const refreshTokenExpiresAt = expiresAt(at);
    await this.repository.addRefresh(tx, session.id, hash, refreshTokenExpiresAt);
    const accessToken = await signAccessToken(
      { userId: session.userId, sessionId: session.id },
      this.settings.JWT_SECRET,
      at,
    );
    const resource = sessionResource(session, session.id);
    return {
      data: {
        ...resource,
        attributes: {
          ...resource.attributes,
          accessToken,
          accessTokenExpiresAt: new Date(
            (Math.floor(at.getTime() / 1000) + ACCESS_TOKEN_SECONDS) * 1000,
          ).toISOString(),
          refreshToken,
          refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
        },
      },
    };
  }
}
function sessionResource(session: SessionRow, current: string) {
  return {
    type: "sessions",
    id: session.id,
    attributes: {
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      current: session.id === current,
    },
    relationships: { user: { data: { type: "users", id: session.userId } } },
  };
}
