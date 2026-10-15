import { Controller, Inject, Req, HttpCode } from "@nestjs/common";
import type { Request } from "express";
import { Operation, JsonApiRequest } from "../../core/jsonapi/decorators.js";
import type { ValidatedRequest } from "../../core/jsonapi/validation.js";
import type { Principal } from "../../core/security/principal.js";
import { PostsService } from "./service.js";
import { listPosts, getPost, createPost, updatePost, deletePost } from "./operations.js";
@Controller()
export class PostsController {
  constructor(@Inject(PostsService) private readonly service: PostsService) {}
  @Operation(listPosts)
  list(@JsonApiRequest() input: ValidatedRequest<typeof listPosts>, @Req() request: Request) {
    return this.service.list(input.principal, input.query, request.originalUrl.split("?")[1] ?? "");
  }
  @Operation(getPost)
  get(@JsonApiRequest() input: ValidatedRequest<typeof getPost>) {
    return this.service.get(input.principal, input.params.id, input.query);
  }
  @Operation(createPost)
  @HttpCode(201)
  create(@JsonApiRequest() input: ValidatedRequest<typeof createPost>) {
    return this.service.create(input.principal as Principal, input.body.data);
  }
  @Operation(updatePost)
  update(@JsonApiRequest() input: ValidatedRequest<typeof updatePost>) {
    return this.service.update(input.principal as Principal, input.params.id, input.body.data);
  }
  @Operation(deletePost)
  @HttpCode(204)
  delete(@JsonApiRequest() input: ValidatedRequest<typeof deletePost>) {
    return this.service.delete(input.principal as Principal, input.params.id);
  }
}
