/**
 * 요청 문서 검증. FastAPI 템플릿이 본문을 Pydantic 모델로 검증하고 core/jsonapi/errors.py로 에러
 * 문서를 만드는 것과 같은 결과를 낸다. 스키마는 계약(openapi.yaml)의 것을 그대로 써서, 계약이 바뀌면
 * 검증도 따라간다. 시작할 때 요청 문서 스키마를 모두 컴파일한다.
 *
 * 라우트는 에러 우선순위(docs/conventions/jsonapi.md)에 맞춰 두 단계로 부른다.
 *
 *   const body = await readJsonBody(c); // 본문이 JSON이 아니면 400. 인증보다 먼저다
 *   // 인증(401, 403)과 쿼리 파라미터(400)
 *   const document = validateDocument("PostCreateDocument", body); // 400, 403, 409, 422
 */

import type { Context } from "hono";
import type { AppEnv } from "../context.ts";
import type { components } from "../generated/api.ts";
import { isRecord } from "../json.ts";
import { contractSchemas, contractValidator } from "./contract-schemas.ts";
import { normalizeEmail } from "./email.ts";
import { ApiError, errorObject, RequestValidationError } from "./errors.ts";
import { documentErrors } from "./validation-errors.ts";

type Schemas = components["schemas"];

/** 요청 문서 스키마 이름: POST 본문은 *CreateDocument, PATCH 본문은 *UpdateDocument다. */
export type RequestDocumentName = Extract<
  keyof Schemas,
  `${string}CreateDocument` | `${string}UpdateDocument`
>;

/** 검증을 통과한 요청 문서의 타입(계약에서 생성한 타입). */
export type RequestDocument<Name extends RequestDocumentName> = Schemas[Name];

export function isRequestDocumentName(name: string): name is RequestDocumentName {
  return /(Create|Update)Document$/.test(name) && name in contractSchemas;
}

/** 계약의 요청 문서 스키마 이름들. 계약에 Ajv가 다루지 못하는 스키마가 있으면 시작할 때 알린다. */
export const REQUEST_DOCUMENT_NAMES: readonly RequestDocumentName[] =
  Object.keys(contractSchemas).filter(isRequestDocumentName);
for (const name of REQUEST_DOCUMENT_NAMES) contractValidator(name);

/** 앞뒤 공백. Unicode White_Space로 본다(Pydantic의 strip_whitespace와 같다). */
const EDGE_WHITESPACE = /^\p{White_Space}+|\p{White_Space}+$/gu;
const trim = (value: string) => value.replace(EDGE_WHITESPACE, "");
const email = (value: string) => normalizeEmail(trim(value));

/**
 * FastAPI 모델이 검증하기 전에 바꾸는 속성. 계약의 JSON Schema로는 적을 수 없어 여기 둔다.
 * - 이메일(Email = strip 후 EmailStr): 앞뒤 공백을 지우고 도메인을 소문자로 바꾼다.
 * - 이름(PersonName, RoleName = StringConstraints(strip_whitespace=True)): 앞뒤 공백을 지운다.
 * 바꾼 값을 검증하고(길이도 바꾼 값으로 센다) 라우트에 넘긴다. FastAPI 모델이 바뀌면 여기도 바꾼다.
 */
const NORMALIZED_ATTRIBUTES: Partial<
  Record<RequestDocumentName, Readonly<Record<string, (value: string) => string>>>
> = {
  RegistrationCreateDocument: { email, name: trim },
  EmailVerificationRequestCreateDocument: { email },
  PasswordResetRequestCreateDocument: { email },
  SessionCreateDocument: { email },
  UserMeUpdateDocument: { name: trim },
  RoleCreateDocument: { name: trim },
  RoleUpdateDocument: { name: trim },
};

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/**
 * 본문 바이트를 JSON 값으로 읽는다(FastAPI가 의존성보다 먼저 본문을 파싱하는 단계).
 * - 빈 본문은 null이다. validateDocument가 본문이 없다(400 "Field required", pointer "")고 알린다.
 * - UTF-8이 아니면 400 jsonapi.invalid_document(detail과 source 없음). 앞의 BOM은 지운다.
 * - JSON이 아니면 400 jsonapi.invalid_document(source 없음).
 */
export function parseJsonBody(bytes: Uint8Array): unknown {
  if (bytes.byteLength === 0) return null;
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    throw new ApiError(400, "jsonapi.invalid_document");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, "jsonapi.invalid_document", "Request body is not valid JSON.");
  }
}

/** 요청 본문을 읽어 JSON 값으로 돌려준다(parseJsonBody). */
export async function readJsonBody(c: Context<AppEnv>): Promise<unknown> {
  return parseJsonBody(new Uint8Array(await c.req.arrayBuffer()));
}

function invalid(status: 400 | 403, detail: string, pointer: string): RequestValidationError {
  const code = status === 403 ? "permission.denied" : "jsonapi.invalid_document";
  return new RequestValidationError(status, [errorObject(status, code, detail, { pointer })]);
}

/**
 * 생성 요청의 data에 클라이언트가 만든 id가 있으면 403 permission.denied(/data/id)다. FastAPI는
 * data를 검증하기 전에 보므로(model_validator(mode="before")) data 안의 다른 오류는 내지 않는다.
 */
function rejectClientId(body: unknown): void {
  const data = isRecord(body) ? body.data : undefined;
  if (isRecord(data) && Object.hasOwn(data, "id")) {
    throw invalid(403, "Client-generated ids are not supported.", "/data/id");
  }
}

/** NORMALIZED_ATTRIBUTES의 속성을 바꾼다. document는 검증할 사본이라 그대로 고친다. */
function normalizeAttributes(name: RequestDocumentName, document: unknown): void {
  const normalizers = NORMALIZED_ATTRIBUTES[name];
  const data = isRecord(document) ? document.data : undefined;
  const attributes = isRecord(data) ? data.attributes : undefined;
  if (normalizers === undefined || !isRecord(attributes)) return;
  for (const [key, normalize] of Object.entries(normalizers)) {
    const value = attributes[key];
    if (typeof value === "string") attributes[key] = normalize(value);
  }
}

/**
 * 본문(readJsonBody의 값)을 계약의 요청 문서 스키마로 검증한다. 통과하면 문서를 돌려주고, 아니면
 * FastAPI와 같은 RequestValidationError를 던진다. 돌려주는 문서는 본문의 사본이다: 이메일과 이름은
 * FastAPI처럼 바꾼 값이고, 스키마에 없는 멤버는 뺐다(Pydantic의 extra="ignore").
 */
export function validateDocument<Name extends RequestDocumentName>(
  name: Name,
  body: unknown,
): RequestDocument<Name> {
  if (body === null || body === undefined) throw invalid(400, "Field required", "");
  if (name.endsWith("CreateDocument")) rejectClientId(body);
  const document: unknown = structuredClone(body);
  normalizeAttributes(name, document);
  const validate = contractValidator(name);
  if (validate(document)) return document as RequestDocument<Name>;
  const schema = contractSchemas[name];
  if (schema === undefined) throw new Error(`계약에 ${name} 스키마가 없다.`);
  const { status, errors } = documentErrors(schema, document, validate.errors ?? []);
  throw new RequestValidationError(status, errors);
}

/**
 * 수정 요청(PATCH) 본문의 data.id가 경로의 리소스와 다르면 409 resource.conflict(/data/id)다
 * (FastAPI의 require_matching_id). /api/v1/me는 로그인한 사용자의 id를 넘긴다.
 */
export function requireMatchingId(documentId: string, resourceId: string): void {
  if (documentId !== resourceId) {
    const detail = `data.id ${documentId} does not match the resource ${resourceId}.`;
    throw new ApiError(409, "resource.conflict", detail, { pointer: "/data/id" });
  }
}
