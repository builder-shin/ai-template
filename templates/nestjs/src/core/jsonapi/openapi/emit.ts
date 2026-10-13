import type { OperationDeclaration } from "../operation.js";
import type { RegisteredComponent } from "../schemas.js";
import { z } from "zod";
import { normalizeSchema, type JsonSchema } from "./normalize.js";
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string };
  servers: { url: string }[];
  tags: { name: string }[];
  paths: Record<
    string,
    Record<string, { responses: Record<string, unknown>; [key: string]: unknown }>
  >;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
}
export function buildOpenApi(
  declarations: readonly OperationDeclaration[],
  registry: ReadonlyMap<string, RegisteredComponent>,
): OpenApiDocument {
  const refs = z.registry<{ id: string }>();
  for (const [name, component] of registry) refs.add(component.schema, { id: name });
  const options = {
    io: "input" as const,
    metadata: refs,
    uri: (id: string) => "#/components/schemas/" + id,
    override: ({ zodSchema, jsonSchema }: { zodSchema: z.core.$ZodType; jsonSchema: object }) => {
      Object.assign(jsonSchema, z.globalRegistry.get(zodSchema));
    },
  };
  const exported = z.toJSONSchema(refs, options).schemas;
  const schemas = Object.fromEntries(
    Object.entries(exported).map(([name, schema]) => {
      const discriminator = registry.get(name)?.discriminator;
      return [name, { ...normalizeSchema(schema), ...(discriminator ? { discriminator } : {}) }];
    }),
  );
  const schemaFor = (schema: z.ZodType): JsonSchema => {
    const name = refs.get(schema)?.id;
    return name
      ? { $ref: "#/components/schemas/" + name }
      : componentRefs(
          normalizeSchema(z.toJSONSchema(schema, { ...options, cycles: "throw" })),
          registry,
        );
  };
  const paths: OpenApiDocument["paths"] = {};
  for (const op of declarations) {
    const parameters: Record<string, unknown>[] = [];
    const params = op.params?.shape as Readonly<Record<string, z.ZodType>> | undefined;
    for (const [name, schema] of Object.entries(params ?? {}))
      parameters.push({ name, in: "path", required: true, schema: schemaFor(schema) });
    const query = (name: string, schema: JsonSchema) =>
      parameters.push({ name, in: "query", required: false, schema, explode: false });
    if (op.query?.page) {
      query("page[number]", { type: "integer", format: "int32", minimum: 1, default: 1 });
      query("page[size]", {
        type: "integer",
        format: "int32",
        minimum: 1,
        maximum: op.query.page.maxSize,
        default: op.query.page.defaultSize,
      });
    }
    if (op.query?.sort) query("sort", { type: "string" });
    if (op.query?.include) query("include", { type: "string" });
    for (const name of Object.keys(op.query?.fields ?? {}))
      query("fields[" + name + "]", { type: "string" });
    for (const [name, schema] of Object.entries(op.query?.filters ?? {}))
      query("filter[" + name + "]", schemaFor(schema));
    const responses = Object.fromEntries(
      Object.entries(op.responses).map(([status, response]) => {
        if (response.schema && !registry.has(response.schema))
          throw new Error("응답 컴포넌트가 없다: " + response.schema);
        return [
          status,
          {
            description: response.description,
            ...(response.headers === undefined
              ? {}
              : {
                  headers: Object.fromEntries(
                    Object.entries(response.headers).map(([name, header]) => [
                      name,
                      {
                        schema: schemaFor(header.schema),
                        ...(header.required === undefined ? {} : { required: header.required }),
                        ...(header.description === undefined
                          ? {}
                          : { description: header.description }),
                      },
                    ]),
                  ),
                }),
            ...(response.schema
              ? {
                  content: {
                    [response.contentType ?? "application/vnd.api+json"]: {
                      schema: { $ref: "#/components/schemas/" + response.schema },
                    },
                  },
                }
              : {}),
          },
        ];
      }),
    );
    const path = (paths[op.path] ??= {});
    const method = op.method.toLowerCase();
    if (Object.hasOwn(path, method)) throw new Error("operation 경로가 중복된다: " + op.path);
    path[method] = {
      operationId: op.operationId,
      summary: op.summary,
      tags: [...op.tags],
      parameters,
      responses,
      ...(op.auth === "required"
        ? { security: [{ BearerAuth: [] }] }
        : op.auth === "optional"
          ? { security: [{}, { BearerAuth: [] }] }
          : {}),
      ...(op.permission ? { "x-permission": op.permission } : {}),
      ...(op.query?.sort ? { "x-jsonapi-sort": [...op.query.sort] } : {}),
      ...(op.query?.include ? { "x-jsonapi-include": [...op.query.include] } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: { "application/vnd.api+json": { schema: schemaFor(op.body) } },
            },
          }
        : {}),
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "AI Template Platform API", version: "1.0.0" },
    servers: [{ url: "http://localhost:8000" }],
    tags: [...new Set(declarations.flatMap((op) => [...op.tags]))].map((name) => ({ name })),
    paths,
    components: { schemas, securitySchemes: { BearerAuth: { type: "http", scheme: "Bearer" } } },
  };
}
/** 단일 스키마 내보내기의 로컬 $defs 참조를 이미 등록한 컴포넌트로 옮긴다. */
function componentRefs(
  schema: JsonSchema,
  registry: ReadonlyMap<string, RegisteredComponent>,
): JsonSchema {
  const result = { ...schema };
  if (typeof result.$ref === "string" && result.$ref.startsWith("#/$defs/")) {
    const name = result.$ref.slice("#/$defs/".length);
    if (registry.has(name)) result.$ref = "#/components/schemas/" + name;
  }
  for (const key of ["properties", "patternProperties", "$defs"]) {
    const value = result[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const entries = Object.entries(value).filter(
        ([name]) => key !== "$defs" || !registry.has(name),
      );
      if (key === "$defs" && !entries.length) delete result.$defs;
      else result[key] = Object.fromEntries(entries.map(([name, child]) => [name, visit(child)]));
    }
  }
  for (const key of [
    "items",
    "additionalProperties",
    "unevaluatedProperties",
    "propertyNames",
    "not",
    "if",
    "then",
    "else",
  ])
    if (Object.hasOwn(result, key)) result[key] = visit(result[key]);
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"])
    if (Array.isArray(result[key])) result[key] = result[key].map(visit);
  function visit(value: unknown): unknown {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? componentRefs(value as JsonSchema, registry)
      : value;
  }
  return result;
}
