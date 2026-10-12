import type { z } from "zod";
import type { RegisteredSchema } from "./schemas.js";
export type PermissionCode =
  | "admin:access"
  | "users:read"
  | "users:manage"
  | "roles:read"
  | "roles:manage"
  | "audit-logs:read"
  | "posts:create"
  | "posts:manage";
export type ErrorBundle = readonly number[];
export const COMMON_ERRORS = [400, 406, 429, 500, 503] as const;
export const BODY_ERRORS = [413, 415, 422] as const;
export const AUTH_ERRORS = [401, 403] as const;
export const NOT_FOUND = [404] as const;
export const CONFLICT = [409] as const;
export const CREATE_ERRORS = [403, 409] as const;
export const UNPROCESSABLE = [422] as const;
export interface QueryDeclaration {
  include?: readonly string[];
  fields?: readonly string[];
  sort?: readonly string[];
  filters?: Readonly<Record<string, z.ZodType>>;
}
export interface OperationResponse {
  status: number;
  schema?: RegisteredSchema;
  mediaType?: string;
  redirect?: boolean;
}
export interface OperationDeclaration {
  interface: string;
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  tag: string;
  auth: "required" | "optional" | "none";
  permission?: PermissionCode;
  errors: readonly ErrorBundle[];
  query?: QueryDeclaration;
  body?: RegisteredSchema;
  responses: readonly OperationResponse[];
}
export function operationId(decl: OperationDeclaration): string {
  return `${decl.interface}_${decl.name}`;
}
export function defineOperation(decl: OperationDeclaration): OperationDeclaration {
  const statuses = new Set(decl.errors.flat());
  const required =
    decl.method === "POST"
      ? decl.auth === "required"
        ? CONFLICT
        : CREATE_ERRORS
      : decl.method === "PATCH"
        ? CONFLICT
        : [];
  if (required.some((s) => !statuses.has(s)))
    throw new Error(`${operationId(decl)} must declare ${required.join(",")}`);
  if (decl.permission && decl.auth !== "required")
    throw new Error("Permission requires authentication.");
  if (!decl.responses.length) throw new Error("Operation requires a response.");
  return Object.freeze(decl);
}
export const MOUNTED_OPERATIONS = new Map<string, OperationDeclaration>();
