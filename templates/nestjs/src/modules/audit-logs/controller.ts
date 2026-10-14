import { Controller, Inject, Req } from "@nestjs/common";
import type { Request } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { AuditLogsService } from "./service.js";
import { listAuditLogs, getAuditLog } from "./operations.js";
@Controller()
export class AuditLogsController {
  constructor(@Inject(AuditLogsService) private readonly service: AuditLogsService) {}
  @Operation(listAuditLogs)
  list(@JsonApiRequest() input: ValidatedRequest<typeof listAuditLogs>, @Req() req: Request) {
    return this.service.list(
      input.principal as Principal,
      input.query,
      req.originalUrl.split("?")[1] ?? "",
    );
  }
  @Operation(getAuditLog)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getAuditLog>) {
    return this.service.get(input.principal as Principal, input.params.id, input.query);
  }
}
