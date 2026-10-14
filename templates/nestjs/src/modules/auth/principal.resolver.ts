import { Inject, Injectable } from "@nestjs/common";
import type { Principal, PrincipalResolver } from "../../core/security/principal.js";
import { verifyAccessToken, tokenError } from "../../core/security/jwt.js";
import { UnitOfWork } from "../../core/db/unit-of-work.js";
import { SETTINGS, type Settings } from "../../core/config/settings.js";
import { RolesRepository } from "../roles/index.js";
import { AuthRepository } from "./repository.js";
import { SessionsRepository } from "./sessions.repository.js";
@Injectable()
export class JwtPrincipalResolver implements PrincipalResolver {
  constructor(
    @Inject(UnitOfWork) private readonly unit: UnitOfWork,
    @Inject(SessionsRepository) private readonly sessions: SessionsRepository,
    @Inject(AuthRepository) private readonly users: AuthRepository,
    @Inject(RolesRepository) private readonly roles: RolesRepository,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async resolve(authorization: string | undefined): Promise<Principal | undefined> {
    if (authorization === undefined) return undefined;
    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) throw tokenError();
    const claims = await verifyAccessToken(match[1], this.settings.JWT_SECRET);
    return this.unit.run(async (tx) => {
      const session = await this.sessions.find(tx, claims.sessionId);
      if (
        !session ||
        session.userId !== claims.userId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        throw tokenError();
      const user = await this.users.findById(tx, claims.userId);
      if (!user || user.status !== "active") throw tokenError();
      return {
        userId: claims.userId,
        sessionId: claims.sessionId,
        permissions: await this.roles.permissionsOf(tx, claims.userId),
      };
    });
  }
}
