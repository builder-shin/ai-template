import { Controller, Req } from "@nestjs/common";
import type { Request } from "express";
import type { z } from "zod";
import { JsonApiRoute, JsonApiRequest, JsonApiPrincipal } from "../../core/jsonapi/decorators.js";
import type { ParsedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { PostsService } from "./service.js";
import { Posts_list, Posts_get, Posts_create, Posts_update, Posts_delete } from "./operations.js";
import type { PostCreateDocument, PostUpdateDocument } from "./schemas.js";
@Controller()
export class PostsController {
  constructor(private readonly posts: PostsService) {}
  @JsonApiRoute(Posts_list)
  list(@JsonApiRequest() parsed: ParsedRequest, @JsonApiPrincipal() viewer: Principal | null) {
    return this.posts.list(viewer, parsed.query);
  }
  @JsonApiRoute(Posts_get)
  get(@JsonApiRequest() parsed: ParsedRequest, @JsonApiPrincipal() viewer: Principal | null) {
    return this.posts.get(parsed.params.id ?? "", viewer, parsed.query);
  }
  @JsonApiRoute(Posts_create)
  create(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof PostCreateDocument>>,
    @JsonApiPrincipal() actor: Principal,
  ) {
    return this.posts.create(actor, parsed.body.data);
  }
  @JsonApiRoute(Posts_update)
  update(
    @JsonApiRequest() parsed: ParsedRequest<unknown, z.infer<typeof PostUpdateDocument>>,
    @JsonApiPrincipal() actor: Principal,
  ) {
    return this.posts.update(actor, parsed.params.id ?? "", parsed.body.data);
  }
  @JsonApiRoute(Posts_delete)
  delete(
    @JsonApiRequest() parsed: ParsedRequest,
    @JsonApiPrincipal() actor: Principal,
    @Req() req: Request,
  ) {
    return this.posts.delete(actor, parsed.params.id ?? "", req.ip);
  }
}
