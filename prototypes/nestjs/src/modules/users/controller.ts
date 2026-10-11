import { Controller } from "@nestjs/common";
import type { Principal } from "../../core/security/principal.js";
import { JsonApiRoute, JsonApiRequest, JsonApiPrincipal } from "../../core/jsonapi/decorators.js";
import type { ParsedRequest } from "../../core/jsonapi/validation.js";
import { UsersService } from "./service.js";
import { Me_get } from "./operations.js";
@Controller()
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @JsonApiRoute(Me_get)
  me(@JsonApiRequest() parsed: ParsedRequest, @JsonApiPrincipal() principal: Principal) {
    return this.service.me(principal.userId, parsed.query);
  }
}
