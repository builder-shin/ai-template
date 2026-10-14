import { Controller, HttpCode, Inject } from "@nestjs/common";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { getMe, updateMe, deleteMe } from "./me.operations.js";
import { MeService } from "./me.service.js";
@Controller()
export class MeController {
  constructor(@Inject(MeService) private readonly service: MeService) {}
  @Operation(getMe)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getMe>) {
    return this.service.get(input.principal as Principal, input.query);
  }
  @Operation(updateMe)
  update(@JsonApiRequest() input: ValidatedRequest<typeof updateMe>) {
    return this.service.update(input.principal as Principal, input.body.data);
  }
  @Operation(deleteMe)
  @HttpCode(204)
  delete(@JsonApiRequest() input: ValidatedRequest<typeof deleteMe>) {
    return this.service.delete(input.principal as Principal);
  }
}
