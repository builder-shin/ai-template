import { z } from "zod";
import { SCHEMA_METADATA } from "../strings.js";
import { MOUNTED_OPERATIONS, operationId } from "../operation.js";
import type { OperationDeclaration } from "../operation.js";
import { JSONAPI_MEDIA_TYPE } from "../render.js";
import { normalizeSchema } from "./normalize.js";
import { CHANNELS, EVENTS, MESSAGES } from "./realtime.js";
export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
  [key: string]: unknown;
}
export function emitSchemas(): Record<string, unknown> {
  const raw = z.toJSONSchema(SCHEMA_METADATA, {
    metadata: SCHEMA_METADATA,
    target: "draft-2020-12",
    io: "input",
    uri: (id) => `#/components/schemas/${id}`,
  });
  return Object.fromEntries(
    Object.entries(raw.schemas)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, schema]) => [name, normalizeSchema(schema)]),
  );
}
function ref(schema: z.ZodType): { $ref: string } {
  const id = SCHEMA_METADATA.get(schema)?.id;
  if (!id) throw new Error("Response/body schema must be registered.");
  return { $ref: `#/components/schemas/${id}` };
}
const queryParam = (name: string, schema: unknown) => ({
  name,
  in: "query",
  required: false,
  schema,
  explode: false,
});
export function emitOperation(decl: OperationDeclaration): Record<string, unknown> {
  const parameters: unknown[] = [...decl.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  }));
  const q = decl.query;
  if (q?.sort)
    parameters.push(
      queryParam("page[number]", { type: "integer", format: "int32", minimum: 1, default: 1 }),
      queryParam("page[size]", {
        type: "integer",
        format: "int32",
        minimum: 1,
        maximum: 100,
        default: 20,
      }),
      queryParam("sort", { type: "string" }),
    );
  if (q?.include?.length) parameters.push(queryParam("include", { type: "string" }));
  for (const type of q?.fields ?? [])
    parameters.push(queryParam(`fields[${type}]`, { type: "string" }));
  for (const [name, schema] of Object.entries(q?.filters ?? {}))
    parameters.push(
      queryParam(
        `filter[${name}]`,
        SCHEMA_METADATA.get(schema)?.id
          ? ref(schema)
          : normalizeSchema(
              z.toJSONSchema(schema, {
                metadata: SCHEMA_METADATA,
                target: "draft-2020-12",
                io: "input",
              }),
            ),
      ),
    );
  const responses: Record<string, unknown> = {};
  for (const r of decl.responses)
    responses[String(r.status)] = {
      description: r.redirect ? "Redirection" : `${String(r.status)} response.`,
      ...(r.schema
        ? { content: { [r.mediaType ?? JSONAPI_MEDIA_TYPE]: { schema: ref(r.schema) } } }
        : {}),
      ...(r.redirect
        ? { headers: { location: { required: true, schema: { type: "string", format: "uri" } } } }
        : {}),
    };
  for (const status of [...new Set(decl.errors.flat())].sort((a, b) => a - b))
    responses[String(status)] = {
      description: `${String(status)} response.`,
      content: { [JSONAPI_MEDIA_TYPE]: { schema: { $ref: "#/components/schemas/ErrorDocument" } } },
      ...(status === 429
        ? {
            headers: {
              "Retry-After": { required: true, schema: { type: "integer", format: "int32" } },
            },
          }
        : {}),
    };
  return {
    operationId: operationId(decl),
    tags: [decl.tag],
    ...(decl.auth === "none"
      ? {}
      : { security: decl.auth === "optional" ? [{ BearerAuth: [] }, {}] : [{ BearerAuth: [] }] }),
    ...(decl.permission ? { "x-permission": decl.permission } : {}),
    ...(q?.include?.length ? { "x-jsonapi-include": q.include } : {}),
    ...(q?.sort ? { "x-jsonapi-sort": q.sort } : {}),
    parameters,
    ...(decl.body
      ? {
          requestBody: {
            required: true,
            content: { [JSONAPI_MEDIA_TYPE]: { schema: ref(decl.body) } },
          },
        }
      : {}),
    responses,
  };
}
export function emitOpenApi(
  operations: readonly OperationDeclaration[] = [...MOUNTED_OPERATIONS.values()],
): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const decl of operations) {
    const path = (paths[decl.path] ??= {});
    path[decl.method.toLowerCase()] = emitOperation(decl);
  }
  return {
    "x-generated": "Do not edit. Run pnpm gen.",
    openapi: "3.1.0",
    info: { title: "Platform API", version: "0.1.0" },
    servers: [{ url: "http://localhost:8000" }],
    tags: [...new Set(operations.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      schemas: emitSchemas(),
      securitySchemes: { BearerAuth: { type: "http", scheme: "Bearer" } },
    },
    "x-realtime-channels": CHANNELS,
    "x-realtime-events": EVENTS,
    "x-realtime-messages": MESSAGES,
  };
}
