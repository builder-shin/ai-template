import { Controller, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express from "express";
import { JsonApiRoute, JsonApiRequest } from "../decorators.js";
import type { JsonApiPorts } from "../decorators.js";
import type { ParsedRequest } from "../validation.js";
import { ApiError } from "../errors.js";
import { installJsonApi } from "../pipeline.js";
import { JsonApiExceptionFilter } from "../filter.js";
import { applySparseFields } from "../fields.js";
import { assembleIncluded } from "../include.js";
import { paginationLinks } from "../pagination.js";
import { Posts_list, Posts_create, Posts_update } from "../../../modules/posts/index.js";
import { Registrations_create, Sessions_create } from "../../../modules/auth/index.js";
import { Files_create } from "../../../modules/files/index.js";
import { defineOperation } from "../operation.js";
import { z } from "zod";
import { SCHEMA_METADATA } from "../strings.js";
export const testAuthenticator = {
  authenticate: (req: express.Request) =>
    Promise.resolve(
      req.get("Authorization") === "Bearer good"
        ? { id: "test", permissions: ["roles:read", "posts:create"] as const }
        : null,
    ),
};
const file = { type: "files", id: "file", attributes: { filename: "image" }, relationships: {} };
const author = {
  type: "users",
  id: "author",
  attributes: { name: "Name" },
  relationships: { avatar: { data: { type: "files", id: "file" } } },
};
const post = {
  type: "posts",
  id: "post",
  attributes: { title: "Title", body: "Body" },
  relationships: {
    author: { data: { type: "users", id: "author" } },
    coverImage: { data: { type: "files", id: "file" } },
  },
};
const Sample_list = defineOperation({
  ...Posts_list,
  interface: "Sample",
  path: "/api/v1/sample",
  query: {
    ...Posts_list.query,
    include: ["author", "coverImage", "author.avatar"],
    filters: {
      ...Posts_list.query?.filters,
      createdFrom: z
        .string()
        .refine(
          (v) =>
            /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)),
        )
        .register(SCHEMA_METADATA, { format: "date-time" }),
    },
  },
});
@Controller()
class SampleController {
  @JsonApiRoute(
    defineOperation({
      ...Posts_list,
      interface: "SampleDetail",
      path: "/api/v1/sample-detail",
      query: {},
    }),
  )
  detail() {
    throw new ApiError(422, "validation.invalid_format", "a\uD800b\uDCFF");
  }
  @JsonApiRoute(Sample_list)
  async list(@JsonApiRequest() req: ParsedRequest) {
    const included = await assembleIncluded(req.query.include, {
      author: () => [author],
      coverImage: () => [file],
      "author.avatar": () => [author, file],
    });
    return applySparseFields(
      {
        data: [post],
        ...(included.length ? { included } : {}),
        ...paginationLinks("/api/v1/sample", req.query.raw, req.query.page, 1),
      },
      req.query.fields,
    );
  }
  @JsonApiRoute(Posts_list)
  posts(@JsonApiRequest() req: ParsedRequest) {
    return { data: [], meta: { page: req.query.page } };
  }
  @JsonApiRoute(Posts_create)
  create(@JsonApiRequest() req: ParsedRequest) {
    if (!req.body) throw new Error("Expected validated body.");
    throw new ApiError(429, "rate_limit.exceeded", undefined, { headers: { "Retry-After": "2" } });
  }
  @JsonApiRoute(Posts_update)
  update(@JsonApiRequest() req: ParsedRequest) {
    if (req.query.raw.has("domain")) throw new Error("unreachable");
    throw new ApiError(409, "resource.conflict");
  }
  @JsonApiRoute(Registrations_create)
  registration(@JsonApiRequest() req: ParsedRequest) {
    return req.body;
  }
  @JsonApiRoute(Sessions_create)
  session(@JsonApiRequest() req: ParsedRequest) {
    return req.body;
  }
  @JsonApiRoute(Files_create)
  file(@JsonApiRequest() req: ParsedRequest) {
    return req.body;
  }
}
@Module({ controllers: [SampleController] })
class SampleModule {}
export async function createSampleApp(ports: Partial<JsonApiPorts> = {}) {
  const server = express();
  server.set("strict routing", true);
  installJsonApi(server, { authenticator: testAuthenticator, ...ports });
  const app = await NestFactory.create(SampleModule, new ExpressAdapter(server), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
    routeResolutionStrategy: "specificity",
    routeConflictPolicy: { duplicate: "error", shadow: "warn" },
  });
  app.useGlobalFilters(new JsonApiExceptionFilter());
  await app.init();
  return app;
}
