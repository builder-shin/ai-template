import { Injectable, Inject } from "@nestjs/common";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { verifyPassword } from "../../core/security/passwords.js";
import { newToken, digest } from "../../core/security/tokens.js";
import { identifierHash } from "../../core/security/identifier.js";
import { signAccessToken } from "../../core/security/jwt.js";
import { recordAudit } from "../../core/audit/record.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import { UsersService } from "../users/index.js";
import { AuthRepository } from "./repository.js";
import type { Principal } from "../../core/security/principal.js";
import type { z } from "zod";
import type { SessionGrant } from "./schemas.js";
@Injectable()
export class SessionsService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly repository: AuthRepository,
    private readonly users: UsersService,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async create(grant: z.infer<typeof SessionGrant>, userAgent: string | null, ipAddress?: string) {
    if (grant.grantType === "oauthCode") throw new ApiError(401, "auth.oauth_code_invalid");
    if (grant.grantType === "refreshToken") return this.rotate(grant.refreshToken);
    const user = await this.users.find(grant.email);
    const matched = await verifyPassword(grant.password, user?.passwordHash ?? null);
    const failure =
      !matched || !user
        ? new ApiError(401, "auth.invalid_credentials")
        : user.status !== "active"
          ? new ApiError(403, "auth.account_deactivated")
          : user.emailVerifiedAt === null
            ? new ApiError(403, "auth.email_not_verified")
            : null;
    if (failure || !user) {
      await this.uow.run(async (tx) => {
        await recordAudit(tx, "session.login_failed", {
          ...(user ? { targetId: user.id } : {}),
          ...(ipAddress ? { ipAddress } : {}),
          metadata: {
            identifierHash: identifierHash(grant.email, this.settings.IDENTIFIER_HASH_SECRET),
            reason: failure?.code.replace("auth.", "") ?? "invalid_credentials",
          },
        });
      });
      throw failure ?? new ApiError(401, "auth.invalid_credentials");
    }
    return this.uow.run(async (tx) => {
      const now = new Date(),
        expiresAt = new Date(now.getTime() + 30 * 86400000),
        token = newToken();
      const session = await this.repository.open(tx, user.id, userAgent, now, expiresAt);
      await this.repository.refresh(tx, session.id, digest(token), expiresAt);
      await recordAudit(tx, "session.login_succeeded", {
        actorId: user.id,
        targetId: user.id,
        ...(ipAddress ? { ipAddress } : {}),
        metadata: { method: "password" },
      });
      return this.document(session, token, now);
    });
  }
  private async rotate(token: string) {
    const result = await this.uow.run(async (tx) => {
      const now = new Date(),
        row = await this.repository.lockedRefresh(tx, digest(token));
      if (!row || row.expiresAt <= now) throw new ApiError(401, "auth.token_invalid");
      const session = await this.repository.getSession(tx, row.sessionId);
      // Source parity: revoked session wins over already-used row. The first reuser commits.
      if (session?.revokedAt !== null) throw new ApiError(401, "auth.token_invalid");
      if (row.usedAt !== null) {
        await this.repository.revoke(tx, session.id);
        return { error: new ApiError(401, "auth.refresh_token_reused") };
      }
      if (session.expiresAt <= now || session.user.status !== "active")
        throw new ApiError(401, "auth.token_invalid");
      const fresh = newToken(),
        expiresAt = new Date(now.getTime() + 30 * 86400000);
      await this.repository.use(tx, row.id, now);
      const updated = await this.repository.touch(tx, session.id, now, expiresAt);
      await this.repository.refresh(tx, session.id, digest(fresh), expiresAt);
      return { document: await this.document(updated, fresh, now) };
    });
    if (result.error) throw result.error;
    return result.document;
  }
  async logout(principal: Principal): Promise<void> {
    await this.uow.run(async (tx) => {
      await this.repository.revoke(tx, principal.sessionId);
    });
  }
  private async document(
    session: {
      id: string;
      userId: string;
      userAgent: string | null;
      createdAt: Date;
      lastUsedAt: Date;
      expiresAt: Date;
    },
    refreshToken: string,
    now: Date,
  ) {
    const access = await signAccessToken(this.settings.JWT_SECRET, session.userId, session.id, now);
    return {
      data: {
        type: "sessions",
        id: session.id,
        attributes: {
          userAgent: session.userAgent,
          createdAt: session.createdAt.toISOString(),
          lastUsedAt: session.lastUsedAt.toISOString(),
          current: true,
          accessToken: access.token,
          accessTokenExpiresAt: access.expiresAt.toISOString(),
          refreshToken,
          refreshTokenExpiresAt: session.expiresAt.toISOString(),
        },
        relationships: { user: { data: { type: "users", id: session.userId } } },
      },
    };
  }
}
