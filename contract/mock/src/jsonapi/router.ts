/**
 * JSON:API 라우트. 모듈은 계약의 operationId로 라우트를 단다(FastAPI의 JsonApiRouter와 Operation).
 *
 *   api.route("Sessions_list", { auth: "required" }, ({ principal, query }) => ...)
 *
 * 경로, 메서드, 권한, 쿼리 파라미터, 요청 문서는 계약에서 읽는다(operations.ts). auth는 핸들러가 받을
 * principal의 타입을 정하려고 적고, 계약의 security와 다르면 라우트를 달 때 던진다.
 *
 * 요청은 에러 우선순위(docs/conventions/jsonapi.md)대로 본다. 앞 단계가 실패하면 뒤는 보지 않는다.
 * 1. 본문이 JSON인가(400). 요청 문서가 있는 operation만
 * 2. 인증과 권한(401, 403)
 * 3. 쿼리 파라미터(400)
 * 4. 경로 파라미터(형식이 틀리면 404)와 요청 문서(400, 403, 409, 422). 둘의 에러는 함께 모으고, 상태가
 *    섞이면 400이다
 * 그 뒤(엄격한 레이트 리밋, 도메인 규칙)는 핸들러가 본다.
 */

import type { Context, Hono } from "hono";
import type { AppEnv } from "../context.ts";
import { type Authenticator, authorize, type Principal } from "../core/access.ts";
import { parseUuid } from "../core/ids.ts";
import type { operations } from "../generated/api.ts";
import { allowedValues } from "./contract-schemas.ts";
import {
  type ErrorObject,
  type ErrorStatus,
  errorObject,
  RequestValidationError,
} from "./errors.ts";
import {
  type Auth,
  type OperationId,
  type OperationSpec,
  operationSpec,
  type PathParameter,
} from "./operations.ts";
import {
  type CollectionQuery,
  type FilterParsers,
  parseCollectionQuery,
  parseResourceQuery,
  queryParams,
  type ResourceQuery,
} from "./query.ts";
import { readJsonBody, validateDocument } from "./validation.ts";

/** 선언한 auth에 따라 핸들러가 받는 principal. */
export type PrincipalFor<A extends Auth> = A extends "required"
  ? Principal
  : A extends "optional"
    ? Principal | undefined
    : undefined;

type ParametersOf<Id extends OperationId> = operations[Id]["parameters"];
type QueryParameters<Id extends OperationId> = NonNullable<ParametersOf<Id>["query"]>;

/** 컬렉션 GET(page[number]를 받는 operation)은 CollectionQuery, 그 밖은 ResourceQuery다. */
export type QueryOf<Id extends OperationId> = [QueryParameters<Id>] extends [never]
  ? ResourceQuery
  : "page[number]" extends keyof QueryParameters<Id>
    ? CollectionQuery
    : ResourceQuery;

/** 경로 파라미터. uuid는 표준 표기(소문자, 하이픈)로 바꾼 값이다. */
export type PathOf<Id extends OperationId> =
  ParametersOf<Id> extends { path: infer Path } ? Path : Readonly<Record<string, never>>;

/** 검증을 통과한 요청 문서(계약의 타입). 본문이 없는 operation은 undefined다. */
export type DocumentOf<Id extends OperationId> = operations[Id]["requestBody"] extends {
  content: { "application/vnd.api+json": infer Document };
}
  ? Document
  : undefined;

export interface OperationInputs<Id extends OperationId, A extends Auth> {
  readonly c: Context<AppEnv>;
  readonly principal: PrincipalFor<A>;
  readonly query: QueryOf<Id>;
  readonly path: PathOf<Id>;
  readonly document: DocumentOf<Id>;
}

export type OperationHandler<Id extends OperationId, A extends Auth> = (
  inputs: OperationInputs<Id, A>,
) => Response | Promise<Response>;

export interface RouteOptions<A extends Auth> {
  /** 계약의 security와 같아야 한다. */
  readonly auth: A;
  /** 컬렉션 GET의 filter[...] 파서. 계약의 filter 파라미터와 같은 이름, 같은 순서다. */
  readonly filters?: FilterParsers;
}

export interface JsonApiRouter {
  route<Id extends OperationId, A extends Auth>(
    id: Id,
    options: RouteOptions<A>,
    handler: OperationHandler<Id, A>,
  ): void;
}

function checkDeclaration(spec: OperationSpec, options: RouteOptions<Auth>): void {
  if (options.auth !== spec.auth) {
    throw new Error(`${spec.id}: 계약의 인증은 ${spec.auth}인데 ${options.auth}로 달았다.`);
  }
  if (spec.permission !== undefined && spec.auth !== "required") {
    throw new Error(`${spec.id}: 권한이 있는 operation은 로그인이 필수여야 한다.`);
  }
  const filters = Object.keys(options.filters ?? {});
  if (filters.join(",") !== spec.query.filters.join(",")) {
    const declared = spec.query.filters.join(", ") || "없음";
    throw new Error(`${spec.id}: 필터 파서는 계약의 필터(${declared})와 같은 순서로 준다.`);
  }
}

/** OpenAPI 경로 템플릿(/sessions/{id}) → Hono 경로(/sessions/:id). */
function honoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/** 경로 파라미터의 값. 계약의 스키마(uuid 형식, enum)에 맞지 않으면 undefined다. */
function pathValue(parameter: PathParameter, raw: string): string | undefined {
  if (parameter.schema.format === "uuid") return parseUuid(raw);
  const allowed = allowedValues(parameter.schema);
  return allowed.length === 0 || allowed.includes(raw) ? raw : undefined;
}

/**
 * 경로 파라미터와 요청 문서를 검증한다. FastAPI처럼 둘의 오류를 한 번에 모은다(경로가 먼저다).
 * 경로의 형식 오류는 404 resource.not_found다.
 */
function validateInputs(
  c: Context<AppEnv>,
  spec: OperationSpec,
  body: unknown,
): { path: Record<string, string>; document: unknown } {
  const path: Record<string, string> = {};
  const errors: ErrorObject[] = [];
  const statuses = new Set<ErrorStatus>();
  for (const parameter of spec.pathParameters) {
    const value = pathValue(parameter, c.req.param(parameter.name) ?? "");
    if (value !== undefined) {
      path[parameter.name] = value;
      continue;
    }
    statuses.add(404);
    errors.push(errorObject(404, "resource.not_found", "Resource not found."));
  }
  let document: unknown;
  if (spec.requestDocument !== undefined) {
    try {
      document = validateDocument(spec.requestDocument, body);
    } catch (error) {
      if (!(error instanceof RequestValidationError)) throw error;
      statuses.add(error.status);
      errors.push(...error.errors);
    }
  }
  if (errors.length > 0) {
    const [only] = statuses;
    const status = statuses.size === 1 && only !== undefined ? only : 400;
    throw new RequestValidationError(status, errors);
  }
  return { path, document };
}

/** 앱에 JSON:API 라우트를 다는 라우터. 인증기는 auth 모듈이 만든다(FastAPI의 install_access). */
export function createJsonApiRouter(
  app: Hono<AppEnv>,
  authenticator: Authenticator,
): JsonApiRouter {
  return {
    route<Id extends OperationId, A extends Auth>(
      id: Id,
      options: RouteOptions<A>,
      handler: OperationHandler<Id, A>,
    ) {
      const spec = operationSpec(id);
      checkDeclaration(spec, options);
      const filters = options.filters ?? {};
      app.on(spec.method, honoPath(spec.path), async (c) => {
        const body = spec.requestDocument === undefined ? undefined : await readJsonBody(c);
        const principal = authorize(c, spec.auth, spec.permission, authenticator);
        const params = queryParams(c);
        const query =
          spec.query.sort === undefined
            ? parseResourceQuery(params, spec.query)
            : parseCollectionQuery(params, spec.query, filters);
        const { path, document } = validateInputs(c, spec, body);
        return handler({
          c,
          principal: principal as PrincipalFor<A>,
          query: query as QueryOf<Id>,
          path: path as PathOf<Id>,
          document: document as DocumentOf<Id>,
        });
      });
    },
  };
}
