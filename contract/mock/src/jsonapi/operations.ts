/**
 * 계약의 operation 선언. 목의 라우트는 operationId로 계약에서 선언을 읽는다(router.ts).
 *
 * FastAPI는 라우트 선언(Operation)에서 계약을 만들고, 목은 거꾸로 계약에서 선언을 읽는다. 그래서
 * 경로, 메서드, 인증(security), 권한(x-permission), 쿼리 파라미터, include·sort 허용 목록
 * (x-jsonapi-include, x-jsonapi-sort), 요청 문서가 계약과 어긋날 수 없다. 시작할 때 한 번 읽는다.
 */

import { isPermissionCode, type PermissionCode } from "../core/permissions.ts";
import type { operations } from "../generated/api.ts";
import { isRecord } from "../json.ts";
import { contract, type SchemaObject } from "./contract-schemas.ts";
import { JSONAPI_MEDIA_TYPE } from "./media.ts";
import { isRequestDocumentName, type RequestDocumentName } from "./validation.ts";

export type OperationId = keyof operations;
/** 로그인: 필요 없음, 선택(토큰이 있으면 검증), 필수. */
export type Auth = "none" | "optional" | "required";
export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface QuerySpec {
  /** 선언한 쿼리 파라미터 이름. 컬렉션은 선언하지 않은 filter[...]도 받아 필터 파서가 거부한다. */
  readonly names: ReadonlySet<string>;
  /** include 허용 경로(x-jsonapi-include). */
  readonly include: readonly string[];
  /** fields[타입]을 받는 리소스 타입. */
  readonly fields: readonly string[];
  /** 정렬할 수 있는 필드(x-jsonapi-sort). 컬렉션 GET에만 있다. */
  readonly sort: readonly string[] | undefined;
  /** 필터 이름(filter[이름]의 이름). 계약에 적힌 순서다. */
  readonly filters: readonly string[];
}

export interface PathParameter {
  readonly name: string;
  readonly schema: SchemaObject;
}

export interface OperationSpec {
  readonly id: OperationId;
  readonly method: HttpMethod;
  /** OpenAPI 경로 템플릿. 예: /api/v1/sessions/{id} */
  readonly path: string;
  readonly auth: Auth;
  readonly permission: PermissionCode | undefined;
  readonly query: QuerySpec;
  readonly pathParameters: readonly PathParameter[];
  /** 요청 본문의 문서 스키마 이름. 본문이 없는 operation은 undefined다. */
  readonly requestDocument: RequestDocumentName | undefined;
}

const METHODS: Readonly<Record<string, HttpMethod>> = {
  get: "GET",
  post: "POST",
  patch: "PATCH",
  delete: "DELETE",
};
const COMPONENT_PREFIX = "#/components/schemas/";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** security가 없거나 비었으면 none, 빈 요구({})가 있으면 optional, 그 밖은 required다. */
function authOf(security: unknown): Auth {
  if (!Array.isArray(security) || security.length === 0) return "none";
  const anonymous = security.some((item) => isRecord(item) && Object.keys(item).length === 0);
  return anonymous ? "optional" : "required";
}

function bracketed(name: string, prefix: string): string | undefined {
  return name.startsWith(`${prefix}[`) && name.endsWith("]")
    ? name.slice(prefix.length + 1, -1)
    : undefined;
}

function requestDocumentOf(requestBody: unknown): RequestDocumentName | undefined {
  const content = isRecord(requestBody) ? requestBody.content : undefined;
  const media = isRecord(content) ? content[JSONAPI_MEDIA_TYPE] : undefined;
  const schema = isRecord(media) ? media.schema : undefined;
  const ref = isRecord(schema) ? schema.$ref : undefined;
  if (typeof ref !== "string" || !ref.startsWith(COMPONENT_PREFIX)) return undefined;
  const name = ref.slice(COMPONENT_PREFIX.length);
  if (!isRequestDocumentName(name)) throw new Error(`계약의 요청 문서 ${name}을 검증할 수 없다.`);
  return name;
}

function specOf(
  id: string,
  method: HttpMethod,
  path: string,
  operation: SchemaObject,
): OperationSpec {
  const parameters = Array.isArray(operation.parameters)
    ? operation.parameters.filter(isRecord)
    : [];
  const inQuery = parameters.filter((item) => item.in === "query").map((item) => String(item.name));
  const pathParameters = parameters
    .filter((item) => item.in === "path")
    .map((item) => ({ name: String(item.name), schema: isRecord(item.schema) ? item.schema : {} }));
  const permission = operation["x-permission"];
  if (
    permission !== undefined &&
    (typeof permission !== "string" || !isPermissionCode(permission))
  ) {
    throw new Error(`${id}의 x-permission이 등록된 권한이 아니다: ${JSON.stringify(permission)}`);
  }
  const sort = strings(operation["x-jsonapi-sort"]);
  return {
    id: id as OperationId,
    method,
    path,
    auth: authOf(operation.security),
    permission,
    query: {
      names: new Set(inQuery),
      include: strings(operation["x-jsonapi-include"]),
      fields: inQuery.flatMap((name) => bracketed(name, "fields") ?? []),
      sort: sort.length > 0 ? sort : undefined,
      filters: inQuery.flatMap((name) => bracketed(name, "filter") ?? []),
    },
    pathParameters,
    requestDocument: requestDocumentOf(operation.requestBody),
  };
}

function loadOperations(): ReadonlyMap<string, OperationSpec> {
  const specs = new Map<string, OperationSpec>();
  const paths = isRecord(contract.paths) ? contract.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const [key, method] of Object.entries(METHODS)) {
      const operation = item[key];
      if (!isRecord(operation) || typeof operation.operationId !== "string") continue;
      specs.set(operation.operationId, specOf(operation.operationId, method, path, operation));
    }
  }
  return specs;
}

const OPERATIONS = loadOperations();

/** 계약의 operation 선언. 생성한 타입(OperationId)과 계약이 어긋났으면(gen을 빼먹음) 던진다. */
export function operationSpec(id: OperationId): OperationSpec {
  const spec = OPERATIONS.get(id);
  if (spec === undefined) {
    throw new Error(`계약에 operation ${id}가 없다. pnpm gen으로 타입을 다시 만든다.`);
  }
  return spec;
}
