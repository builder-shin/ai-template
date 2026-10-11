import { Injectable, Inject } from "@nestjs/common";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import { verifyAccessToken } from "../../core/security/jwt.js";
import { ApiError } from "../../core/jsonapi/errors.js";
import type { Principal } from "../../core/security/principal.js";
import { UsersService } from "../users/index.js";
import { AuthRepository } from "./repository.js";
@Injectable()
export class Authenticator {
  constructor(
    private readonly repository: AuthRepository,
    private readonly users: UsersService,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}
  async authenticate(bearer: string | undefined): Promise<Principal | null> {
    if (!bearer) return null;
    const match = /^Bearer (\S+)$/i.exec(bearer);
    if (!match?.[1]) throw new ApiError(401, "auth.token_invalid");
    const claims = await verifyAccessToken(this.settings.JWT_SECRET, match[1]);
    const session = await this.repository.activeSession(
      claims.sessionId,
      claims.userId,
      new Date(),
    );
    if (!session) throw new ApiError(401, "auth.token_invalid");
    return {
      ...claims,
      permissions: await this.users.permissions(claims.userId),
      sessionCreatedAt: session.createdAt,
    };
  }
}
