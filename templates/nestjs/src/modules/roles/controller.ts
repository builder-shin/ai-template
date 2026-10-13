import { Controller, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import { listPermissions } from "./operations.js";
import { RolesService } from "./service.js";
@Controller()
export class RolesController {
  constructor(@Inject(RolesService) private readonly service: RolesService) {}
  @Operation(listPermissions)
  permissions(@JsonApiRequest() input: ValidatedRequest, @Req() req: Request) {
    const index = req.originalUrl.indexOf("?");
    return this.service.permissions(input.query, index < 0 ? "" : req.originalUrl.slice(index + 1));
  }
}
