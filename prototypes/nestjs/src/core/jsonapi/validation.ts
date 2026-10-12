import type { z } from "zod";
import type { OperationDeclaration } from "./operation.js";
import type { ParsedQuery } from "./query.js";
import { parseQuery } from "./query.js";
import { ApiError, RequestErrors, isRecord } from "./errors.js";
import type { ErrorCode } from "./error-codes.js";
export interface ParsedRequest<Q = ParsedQuery, B = unknown, P = Readonly<Record<string, string>>> {
  query: Q;
  body: B;
  params: P;
}
function pointer(path: readonly PropertyKey[]): string {
  return path.map((v) => `/${String(v).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}
function valueAt(document: unknown, path: readonly PropertyKey[]): unknown {
  let value = document;
  for (const part of path)
    value = isRecord(value)
      ? value[String(part)]
      : Array.isArray(value)
        ? (value as unknown[])[Number(part)]
        : undefined;
  return value;
}
export function issueError(issue: z.core.$ZodIssue, document: unknown): ApiError {
  const path = issue.path;
  const p = pointer(path);
  const value = valueAt(document, path);
  if (p === "/data/type" && issue.code === "invalid_value" && typeof value === "string")
    return new ApiError(409, "resource.conflict", issue.message, { pointer: p });
  const field = p.startsWith("/data/attributes/") || p.startsWith("/data/relationships/");
  if (!field) return new ApiError(400, "jsonapi.invalid_document", issue.message, { pointer: p });
  let code: ErrorCode = "validation.invalid_format";
  const params: Record<string, unknown> = {};
  if (issue.code === "invalid_type" && value === undefined) code = "validation.required";
  if (issue.code === "invalid_union" && "discriminator" in issue)
    code = value === undefined ? "validation.required" : "validation.invalid_choice";
  if (issue.code === "invalid_value") {
    code = "validation.invalid_choice";
    params.expected = issue.values.map((v) => JSON.stringify(v)).join(", ");
  }
  if (issue.code === "too_small") {
    code = issue.origin === "number" ? "validation.out_of_range" : "validation.too_short";
    params[issue.inclusive ? "min" : "gt"] = issue.minimum;
  }
  if (issue.code === "too_big") {
    code = issue.origin === "number" ? "validation.out_of_range" : "validation.too_long";
    params[issue.inclusive ? "max" : "lt"] = issue.maximum;
  }
  return new ApiError(422, code, issue.message, {
    pointer: p,
    ...(Object.keys(params).length ? { params } : {}),
  });
}
export function parseRequest(
  decl: OperationDeclaration,
  url: string,
  params: Readonly<Record<string, string>>,
  body: unknown,
): ParsedRequest {
  const query = parseQuery(url, decl.query);
  const errors: ApiError[] = [];
  for (const [name, value] of Object.entries(params))
    if (
      name === "id" &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    )
      errors.push(new ApiError(404, "resource.not_found"));
  let parsed: unknown = body;
  if (decl.body) {
    const data = isRecord(body) ? body.data : undefined;
    if (decl.method === "POST" && isRecord(data) && Object.hasOwn(data, "id"))
      errors.push(
        new ApiError(403, "permission.denied", "Client-generated ids are not supported.", {
          pointer: "/data/id",
        }),
      );
    else {
      const result = decl.body.safeParse(body);
      if (result.success) {
        parsed = result.data;
        if (
          decl.method === "PATCH" &&
          isRecord(result.data) &&
          isRecord(result.data.data) &&
          typeof result.data.data.id === "string" &&
          params.id &&
          result.data.data.id !== params.id
        )
          errors.push(new ApiError(409, "resource.conflict", undefined, { pointer: "/data/id" }));
      } else errors.push(...result.error.issues.map((i) => issueError(i, body)));
    }
  }
  if (errors.length) throw new RequestErrors(errors);
  return { query, body: parsed, params };
}
