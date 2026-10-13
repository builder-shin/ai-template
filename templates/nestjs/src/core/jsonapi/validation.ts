import type { z } from "zod";
import type { Principal } from "../security/principal.js";
import { ApiError, ApiErrors } from "./errors.js";
import type { ErrorCode } from "./error-codes.js";
import type { OperationDeclaration, OperationSpec } from "./operation.js";
import { parseQuery, type ParsedQuery } from "./query.js";
export interface ValidatedRequest<S extends OperationSpec = OperationSpec> {
  query: ParsedQuery;
  params: S extends { params: infer P extends z.ZodType } ? z.infer<P> : Record<string, string>;
  body: S extends { body: infer B extends z.ZodType } ? z.infer<B> : unknown;
  principal: Principal | undefined;
}
function at(value: unknown, path: readonly PropertyKey[]): unknown {
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}
function pointer(path: readonly PropertyKey[]): string {
  return path.map((key) => `/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}
function issueError(issue: z.core.$ZodIssue, raw: unknown): ApiError {
  const value = at(raw, issue.path);
  let code: ErrorCode = "validation.invalid_format";
  const params: Record<string, unknown> = {};
  if (issue.code === "invalid_type" && value === undefined) code = "validation.required";
  else if (issue.code === "too_small" || issue.code === "too_big") {
    const minimum = issue.code === "too_small";
    code =
      issue.origin === "string" || issue.origin === "array"
        ? minimum
          ? "validation.too_short"
          : "validation.too_long"
        : "validation.out_of_range";
    params[minimum ? "min" : "max"] = minimum ? issue.minimum : issue.maximum;
  } else if (issue.code === "invalid_value") {
    code = "validation.invalid_choice";
    params.choices = issue.values;
  } else if (issue.code === "invalid_union") code = "validation.invalid_choice";
  else if (issue.code === "invalid_format") params.format = issue.format;
  const structural =
    issue.path.length === 0 ||
    (issue.path[0] === "data" &&
      (issue.path.length === 1 ||
        (issue.path.length === 2 &&
          ["attributes", "relationships", "type", "id"].includes(String(issue.path[1])))));
  const typeConflict =
    issue.path.length === 2 &&
    issue.path[0] === "data" &&
    issue.path[1] === "type" &&
    issue.code === "invalid_value" &&
    typeof value === "string" &&
    !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value);
  const status = typeConflict ? 409 : structural ? 400 : 422;
  if (status === 409) code = "resource.conflict";
  else if (status === 400) code = "jsonapi.invalid_document";
  return new ApiError({
    status,
    code,
    title: "Invalid request",
    source: { pointer: pointer(issue.path) },
    meta: { params },
  });
}
export function validateRequest<S extends OperationSpec>(
  declaration: OperationDeclaration<S>,
  raw: { search: string; params: Record<string, string>; body: unknown },
): ValidatedRequest<S> {
  const query = parseQuery(raw.search, declaration.query ?? {});
  const params = declaration.params?.safeParse(raw.params);
  const body = declaration.body?.safeParse(raw.body);
  const errors: ApiError[] = [];
  if (params && !params.success)
    for (const issue of params.error.issues)
      errors.push(
        new ApiError({
          status: 404,
          code: "resource.not_found",
          title: "Not found",
          source: { parameter: String(issue.path[0] ?? "id") },
        }),
      );
  const dataId = at(raw.body, ["data", "id"]);
  const clientId = declaration.method === "POST" && dataId !== undefined;
  if (clientId)
    errors.push(
      new ApiError({
        status: 403,
        code: "permission.denied",
        title: "Client id is forbidden",
        source: { pointer: "/data/id" },
      }),
    );
  if (
    declaration.method === "PATCH" &&
    typeof dataId === "string" &&
    raw.params.id !== undefined &&
    dataId !== raw.params.id
  )
    errors.push(
      new ApiError({
        status: 409,
        code: "resource.conflict",
        title: "Resource id conflicts",
        source: { pointer: "/data/id" },
      }),
    );
  if (body && !body.success)
    for (const issue of body.error.issues) {
      if (
        clientId &&
        issue.code === "unrecognized_keys" &&
        issue.path.length === 1 &&
        issue.path[0] === "data"
      ) {
        const keys = issue.keys.filter((key) => key !== "id");
        if (keys.length) errors.push(issueError({ ...issue, keys }, raw.body));
      } else errors.push(issueError(issue, raw.body));
    }
  if (errors.length) {
    const statuses = new Set(errors.map((error) => error.init.status));
    throw new ApiErrors(statuses.size === 1 ? (errors[0]?.init.status ?? 400) : 400, errors);
  }
  return {
    query,
    params: params?.success ? params.data : raw.params,
    body: body?.success ? body.data : raw.body,
    principal: undefined,
  } as ValidatedRequest<S>;
}
