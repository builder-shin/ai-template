import { Controller, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { listUsers, getUser, updateUser } from "./admin.operations.js";
import { UsersAdminService } from "./admin.service.js";
@Controller()
export class UsersAdminController {
  constructor(@Inject(UsersAdminService) private readonly service: UsersAdminService) {}
  @Operation(listUsers)
  list(@JsonApiRequest() input: ValidatedRequest<typeof listUsers>, @Req() req: Request) {
    return this.service.list(
      input.principal as Principal,
      input.query,
      req.originalUrl.split("?")[1] ?? "",
    );
  }
  @Operation(getUser)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getUser>) {
    return this.service.get(input.principal as Principal, input.params.id, input.query);
  }
  @Operation(updateUser)
  update(@JsonApiRequest() input: ValidatedRequest<typeof updateUser>) {
    return this.service.update(input.principal as Principal, input.params.id, input.body.data);
  }
}
