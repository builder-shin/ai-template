import { Controller, HttpCode, Inject } from "@nestjs/common";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { createFile, getFile, updateFile, deleteFile } from "./operations.js";
import { FilesService } from "./service.js";
@Controller()
export class FilesController {
  constructor(@Inject(FilesService) private readonly files: FilesService) {}
  @Operation(createFile)
  create(@JsonApiRequest() input: ValidatedRequest<typeof createFile>) {
    return this.files.create(input.principal as Principal, input.body.data.attributes);
  }
  @Operation(getFile)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getFile>) {
    return this.files.get(input.principal, input.params.id, input.query.fields.files);
  }
  @Operation(updateFile)
  update(@JsonApiRequest() input: ValidatedRequest<typeof updateFile>) {
    return this.files.complete(
      input.principal as Principal,
      input.params.id,
      input.body.data.attributes?.status === "ready",
    );
  }
  @Operation(deleteFile)
  @HttpCode(204)
  delete(@JsonApiRequest() input: ValidatedRequest<typeof deleteFile>) {
    return this.files.delete(input.principal as Principal, input.params.id);
  }
}
