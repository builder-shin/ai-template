import { Controller } from "@nestjs/common";
import { JsonApiRoute, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ParsedRequest } from "../../core/jsonapi/validation.js";
import { Permissions_list } from "./operations.js";
import { PermissionService } from "./permissions.service.js";
@Controller()
export class PermissionsController {
  constructor(private readonly service: PermissionService) {}
  @JsonApiRoute(Permissions_list)
  list(@JsonApiRequest() request: ParsedRequest) {
    return this.service.list(request.query);
  }
}
