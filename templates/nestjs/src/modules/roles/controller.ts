import { Controller, Inject, Req, HttpCode } from "@nestjs/common";
import type { Request } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import { listPermissions } from "./operations.js";
import { RolesService } from "./service.js";
import { RolesAdminService } from "./admin.service.js";
import { listRoles, getRole, createRole, updateRole, deleteRole } from "./admin.operations.js";
import type { Principal } from "../../core/security/principal.js";
@Controller()
export class RolesController {
  constructor(
    @Inject(RolesService) private readonly service: RolesService,
    @Inject(RolesAdminService) private readonly admin: RolesAdminService,
  ) {}
  @Operation(listPermissions)
  permissions(@JsonApiRequest() input: ValidatedRequest, @Req() req: Request) {
    const index = req.originalUrl.indexOf("?");
    return this.service.permissions(input.query, index < 0 ? "" : req.originalUrl.slice(index + 1));
  }
  @Operation(listRoles)
  list(@JsonApiRequest() input: ValidatedRequest<typeof listRoles>, @Req() req: Request) {
    return this.admin.list(
      input.principal as Principal,
      input.query,
      req.originalUrl.split("?")[1] ?? "",
    );
  }
  @Operation(getRole)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getRole>) {
    return this.admin.get(input.principal as Principal, input.params.id, input.query);
  }
  @Operation(createRole)
  @HttpCode(201)
  create(@JsonApiRequest() input: ValidatedRequest<typeof createRole>) {
    return this.admin.create(input.principal as Principal, input.body.data.attributes);
  }
  @Operation(updateRole)
  update(@JsonApiRequest() input: ValidatedRequest<typeof updateRole>) {
    return this.admin.update(
      input.principal as Principal,
      input.params.id,
      input.body.data.attributes ?? {},
    );
  }
  @Operation(deleteRole)
  @HttpCode(204)
  delete(@JsonApiRequest() input: ValidatedRequest<typeof deleteRole>) {
    return this.admin.delete(input.principal as Principal, input.params.id);
  }
}
