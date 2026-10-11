import { Controller } from "@nestjs/common";
import type { z } from "zod";
import { JsonApiRoute, JsonApiRequest, JsonApiPrincipal } from "../../core/jsonapi/decorators.js";
import type { ParsedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { FilesService } from "./service.js";
import { Files_create, Files_get, Files_update, Files_delete } from "./operations.js";
import type { FileCreateDocument, FileUpdateDocument } from "./schemas.js";
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}
  @JsonApiRoute(Files_create)
  create(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof FileCreateDocument>>,
    @JsonApiPrincipal() actor: Principal,
  ) {
    return this.files.create(actor, parsed.body.data.attributes);
  }
  @JsonApiRoute(Files_get)
  get(@JsonApiRequest() parsed: ParsedRequest, @JsonApiPrincipal() viewer: Principal | null) {
    return this.files.get(parsed.params.id ?? "", viewer, parsed.query);
  }
  @JsonApiRoute(Files_update)
  update(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof FileUpdateDocument>>,
    @JsonApiPrincipal() actor: Principal,
  ) {
    return this.files.complete(
      actor,
      parsed.params.id ?? "",
      parsed.body.data.attributes?.status === "ready",
    );
  }
  @JsonApiRoute(Files_delete)
  delete(@JsonApiRequest() parsed: ParsedRequest, @JsonApiPrincipal() actor: Principal) {
    return this.files.delete(actor, parsed.params.id ?? "");
  }
}
