import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

/** 테스트가 쓰는 만큼만 좁힌 OpenAPI 3.1 타입. */
export interface Schema {
  type?: string;
  format?: string;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  $ref?: string;
  description?: string;
}

export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
}

interface Content {
  content?: Record<string, { schema?: Schema }>;
}

export interface Operation {
  operationId?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: Content;
  responses: Record<string, Content & { headers?: Record<string, unknown> }>;
  security?: Record<string, string[]>[];
  [extension: `x-${string}`]: unknown;
}

export interface OpenApiDocument {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, Schema>;
    securitySchemes?: Record<string, unknown>;
  };
  [extension: `x-${string}`]: unknown;
}

export const MEDIA_TYPE = "application/vnd.api+json";

const specPath = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));
export const spec = parse(readFileSync(specPath, "utf8")) as OpenApiDocument;

export function operation(method: string, path: string): Operation {
  const found = spec.paths[path]?.[method];
  if (found === undefined) throw new Error(`계약에 ${method.toUpperCase()} ${path}가 없다`);
  return found;
}

export function schema(name: string): Schema {
  const found = spec.components.schemas[name];
  if (found === undefined) throw new Error(`계약에 스키마 ${name}가 없다`);
  return found;
}

export function refName(target: Schema | undefined): string | undefined {
  return target?.$ref?.split("/").at(-1);
}

export function responseRef(op: Operation, status: string, mediaType = MEDIA_TYPE) {
  return refName(op.responses[status]?.content?.[mediaType]?.schema);
}

export function requestRef(op: Operation): string | undefined {
  return refName(op.requestBody?.content?.[MEDIA_TYPE]?.schema);
}

export function parameterNames(op: Operation): string[] {
  return (op.parameters ?? []).map((parameter) => parameter.name);
}

export function statuses(op: Operation): string[] {
  return Object.keys(op.responses).sort();
}

/** 보안 요구가 없으면 "none", 빈 요구가 섞여 있으면 "optional", 아니면 "required". */
export function auth(op: Operation): "none" | "optional" | "required" {
  if (op.security === undefined) return "none";
  return op.security.some((requirement) => Object.keys(requirement).length === 0)
    ? "optional"
    : "required";
}

/** 단일 값 enum인 `type` 속성의 값을 돌려준다. 예: PostResource → "posts" */
export function resourceType(resourceSchema: Schema): unknown {
  return resourceSchema.properties?.type?.enum?.[0];
}

/** `included` 배열 항목이 참조하는 스키마 이름. */
export function includedRefs(documentSchema: Schema): string[] {
  const items = documentSchema.properties?.included?.items;
  const variants = items?.anyOf ?? items?.oneOf ?? (items ? [items] : []);
  return variants.map((variant) => refName(variant) ?? "").sort();
}
