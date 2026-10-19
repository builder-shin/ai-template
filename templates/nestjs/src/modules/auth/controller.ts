import { Controller, HttpCode, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { Principal } from "../../core/security/principal.js";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import {
  authorizeOAuth,
  callbackOAuth,
  createRegistration,
  requestEmailVerification,
  createEmailVerification,
  createSession,
  listSessions,
  deleteCurrentSession,
  deleteSession,
  createSessionRevocation,
  requestPasswordReset,
  createPasswordReset,
  createPasswordChange,
} from "./operations.js";
import { OAuthService } from "./oauth/oauth.service.js";
import { RegistrationService, registrationLocale } from "./registration.service.js";
import { VerificationService } from "./verification.service.js";
import { SessionsService } from "./sessions.service.js";
import { PasswordsService } from "./passwords.service.js";
@Controller()
export class AuthController {
  constructor(
    @Inject(OAuthService) private readonly oauth: OAuthService,
    @Inject(RegistrationService) private readonly registration: RegistrationService,
    @Inject(VerificationService) private readonly verification: VerificationService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(PasswordsService) private readonly passwords: PasswordsService,
  ) {}
  @Operation(requestPasswordReset)
  @HttpCode(202)
  async requestReset(
    @JsonApiRequest() input: ValidatedRequest<typeof requestPasswordReset>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.passwords.request(input.body.data.attributes.email, req.ip ?? "");
    res.status(202).end();
  }
  @Operation(createPasswordReset)
  reset(@JsonApiRequest() input: ValidatedRequest<typeof createPasswordReset>) {
    return this.passwords.reset(input.body.data.attributes);
  }
  @Operation(authorizeOAuth)
  async authorizeOAuth(
    @JsonApiRequest() input: ValidatedRequest<typeof authorizeOAuth>,
    @Res() res: Response,
  ): Promise<void> {
    res
      .status(302)
      .setHeader("Location", await this.oauth.authorize(input.params.provider, input.query));
    res.end();
  }
  @Operation(callbackOAuth)
  async callbackOAuth(
    @JsonApiRequest() input: ValidatedRequest<typeof callbackOAuth>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res
      .status(302)
      .setHeader(
        "Location",
        await this.oauth.callback(
          input.params.provider,
          input.query,
          registrationLocale(req.headers["accept-language"]),
        ),
      );
    res.end();
  }
  @Operation(createPasswordChange)
  change(@JsonApiRequest() input: ValidatedRequest<typeof createPasswordChange>) {
    return this.passwords.change(input.principal as Principal, input.body.data.attributes);
  }
  @Operation(createRegistration)
  register(
    @JsonApiRequest() input: ValidatedRequest<typeof createRegistration>,
    @Req() req: Request,
  ) {
    return this.registration.create(
      input.body.data.attributes,
      req.ip ?? "",
      req.headers["accept-language"],
    );
  }
  @Operation(requestEmailVerification)
  @HttpCode(202)
  async resend(
    @JsonApiRequest() input: ValidatedRequest<typeof requestEmailVerification>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.verification.request(input.body.data.attributes.email, req.ip ?? "");
    res.status(202).end();
  }
  @Operation(createEmailVerification)
  verify(@JsonApiRequest() input: ValidatedRequest<typeof createEmailVerification>) {
    return this.verification.verify(input.body.data.attributes.token);
  }
  @Operation(createSession)
  createSession(
    @JsonApiRequest() input: ValidatedRequest<typeof createSession>,
    @Req() req: Request,
  ) {
    const attributes = input.body.data.attributes;
    if (attributes.grantType === "oauthCode")
      return this.sessions.createWithOAuthCode(attributes, {
        ip: req.ip ?? "",
        ...(req.headers["user-agent"] === undefined
          ? {}
          : { userAgent: req.headers["user-agent"] }),
      });
    if (attributes.grantType === "refreshToken")
      return this.sessions.refresh(attributes.refreshToken);
    return this.sessions.createWithPassword(attributes, {
      ip: req.ip ?? "",
      ...(req.headers["user-agent"] === undefined ? {} : { userAgent: req.headers["user-agent"] }),
    });
  }
  @Operation(listSessions)
  listSessions(
    @JsonApiRequest() input: ValidatedRequest<typeof listSessions>,
    @Req() req: Request,
  ) {
    return this.sessions.list(
      input.principal as Principal,
      input.query,
      req.originalUrl.split("?")[1] ?? "",
    );
  }
  @Operation(deleteCurrentSession)
  @HttpCode(204)
  deleteCurrent(@JsonApiRequest() input: ValidatedRequest<typeof deleteCurrentSession>) {
    return this.sessions.revokeCurrent(input.principal as Principal);
  }
  @Operation(deleteSession)
  @HttpCode(204)
  delete(@JsonApiRequest() input: ValidatedRequest<typeof deleteSession>) {
    return this.sessions.revoke(input.principal as Principal, input.params.id);
  }
  @Operation(createSessionRevocation)
  async revokeMany(@JsonApiRequest() input: ValidatedRequest<typeof createSessionRevocation>) {
    const { scope } = input.body.data.attributes;
    const principal = input.principal as Principal;
    const revokedCount =
      scope === "others"
        ? await this.sessions.revokeOthers(principal)
        : await this.sessions.revokeAll(principal);
    return {
      data: {
        type: "session-revocations",
        id: randomUUID(),
        attributes: { scope, revokedCount, createdAt: new Date().toISOString() },
      },
      meta: { revokedCount },
    };
  }
}
