import { Controller, HttpCode, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import {
  createRegistration,
  requestEmailVerification,
  createEmailVerification,
} from "./operations.js";
import { RegistrationService } from "./registration.service.js";
import { VerificationService } from "./verification.service.js";
@Controller()
export class AuthController {
  constructor(
    @Inject(RegistrationService) private readonly registration: RegistrationService,
    @Inject(VerificationService) private readonly verification: VerificationService,
  ) {}
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
}
