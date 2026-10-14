import type { z } from "zod";
import type { ErrorCode } from "./error-codes.js";
import type { PermissionCode } from "../security/permissions.js";
import type { QuerySpec } from "./query.js";
export interface OperationSpec {
  operationId: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  tags: readonly string[];
  summary: string;
  auth: "required" | "optional" | "none";
  permission?: PermissionCode;
  query?: QuerySpec;
  querySchema?: z.ZodObject;
  params?: z.ZodObject;
  body?: z.ZodType;
  responses: Readonly<
    Record<
      number,
      {
        schema?: string;
        contentType?: "application/vnd.api+json" | "application/json";
        description: string;
        headers?: Readonly<
          Record<string, { schema: z.ZodType; required?: boolean; description?: string }>
        >;
      }
    >
  >;
  errors: readonly ErrorCode[];
  overlaps?: readonly string[];
}
export type OperationDeclaration<S extends OperationSpec = OperationSpec> = Omit<
  S,
  "responses" | "errors"
> &
  Pick<OperationSpec, "responses" | "errors">;
const registry = new Map<string, OperationDeclaration>();
export function defineOperation<const S extends OperationSpec>(spec: S): OperationDeclaration<S> {
  if (spec.query && spec.querySchema) throw new Error("쿼리 선언 방식은 하나만 쓴다");
  if (registry.has(spec.operationId))
    throw new Error(`operationId가 중복된다: ${spec.operationId}`);
  const responses = { ...spec.responses };
  const errors = new Set(spec.errors);
  if (spec.method === "POST") {
    if (!Object.hasOwn(responses, 403))
      responses[403] = {
        schema: "ErrorDocument",
        contentType: "application/vnd.api+json",
        description: "Forbidden",
      };
    errors.add("permission.denied");
  }
  if (spec.method === "POST" || spec.method === "PATCH") {
    if (!Object.hasOwn(responses, 409))
      responses[409] = {
        schema: "ErrorDocument",
        contentType: "application/vnd.api+json",
        description: "Conflict",
      };
    errors.add("resource.conflict");
  }
  const declaration = { ...spec, responses, errors: [...errors] };
  registry.set(spec.operationId, declaration);
  return declaration;
}
export function operations(): readonly OperationDeclaration[] {
  return [...registry.values()];
}
