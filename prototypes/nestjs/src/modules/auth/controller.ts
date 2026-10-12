import { StrictRateLimiter } from "../../core/ratelimit/strict.js";
import { identifierHash } from "../../core/security/identifier.js";
import { Inject } from "@nestjs/common";
import { SETTINGS } from "../../core/config/settings.js";
import type { Settings } from "../../core/config/settings.js";
import { Controller, Req } from "@nestjs/common";
import type { Request } from "express";
import type { z } from "zod";
import { JsonApiRoute, JsonApiRequest, JsonApiPrincipal } from "../../core/jsonapi/decorators.js";
import type { ParsedRequest } from "../../core/jsonapi/validation.js";
import { AccountsService } from "./accounts.service.js";
import { SessionsService } from "./sessions.service.js";
import type { Principal } from "../../core/security/principal.js";
import {
  Registrations_create,
  EmailVerificationRequests_create,
  EmailVerifications_create,
  Sessions_create,
  Sessions_deleteCurrent,
} from "./operations.js";
import type {
  RegistrationCreateDocument,
  EmailVerificationRequestCreateDocument,
  EmailVerificationCreateDocument,
  SessionCreateDocument,
} from "./schemas.js";
@Controller()
export class AuthController {
  constructor(
    private readonly limiter: StrictRateLimiter,
    @Inject(SETTINGS) private readonly settings: Settings,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {}
  @JsonApiRoute(Registrations_create)
  async register(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof RegistrationCreateDocument>>,
    @Req() request: Request,
  ) {
    await this.limiter.check("registration-ip", request.ip ?? "unknown");
    return this.accounts.register(parsed.body.data.attributes, request.headers["accept-language"]);
  }
  @JsonApiRoute(EmailVerificationRequests_create)
  async resend(
    @JsonApiRequest()
    parsed: ParsedRequest<unknown, z.infer<typeof EmailVerificationRequestCreateDocument>>,
  ) {
    await this.limiter.check(
      "verification-email",
      identifierHash(parsed.body.data.attributes.email, this.settings.IDENTIFIER_HASH_SECRET),
    );
    return this.accounts.requestVerification(parsed.body.data.attributes.email);
  }
  @JsonApiRoute(EmailVerifications_create)
  verify(
    @JsonApiRequest()
    parsed: ParsedRequest<unknown, z.infer<typeof EmailVerificationCreateDocument>>,
  ) {
    return this.accounts.verify(parsed.body.data.attributes.token);
  }
  @JsonApiRoute(Sessions_create)
  async create(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof SessionCreateDocument>>,
    @Req() request: Request,
  ) {
    await this.limiter.check("login-ip", request.ip ?? "unknown");
    return this.sessions.create(
      parsed.body.data.attributes,
      request.headers["user-agent"]?.slice(0, 500) ?? null,
      request.ip,
    );
  }
  @JsonApiRoute(Sessions_deleteCurrent)
  logout(@JsonApiPrincipal() principal: Principal) {
    return this.sessions.logout(principal);
  }
}
