/**
 * Ajv의 검증 오류를, FastAPI 템플릿이 같은 요청에 내는 에러 객체로 옮긴다. FastAPI는 Pydantic 오류를
 * core/jsonapi/errors.py(_body_error, validation_error_objects)로 바꾼다. 여기서는 Ajv 오류를 먼저
 * Pydantic 오류와 같은 모양(Issue)으로 바꾸고 같은 규칙을 적용한다.
 *
 * 1. Ajv 오류 → Issue. 널 허용(anyOf [X, null])의 null 가지 오류와 anyOf 요약은 버린다. Pydantic은
 *    X의 오류만 낸다.
 * 2. 위치마다 Issue 하나만 남긴다(Pydantic은 필드마다 오류 하나다). 선택지(enum) 오류가 형 오류보다
 *    앞선다. Pydantic의 enum·Literal은 형을 따로 보지 않고 선택지 오류를 낸다.
 * 3. 상태와 코드는 errors.py의 _body_error 규칙을 따른다.
 * 4. Pydantic처럼 모델 필드 순서(계약의 properties 순서)로, 깊이 우선으로 늘어놓는다.
 */

import type { ErrorObject as AjvError } from "ajv/dist/2020.js";
import {
  allowedValues,
  discriminatedUnion,
  locate,
  propertySchema,
  type SchemaObject,
} from "./contract-schemas.ts";
import { type ErrorCode, type ErrorObject, type ErrorStatus, errorObject } from "./errors.ts";
import { escapeSegment, valueAt } from "./pointer.ts";
import {
  counted,
  discriminatorNames,
  expectedText,
  formatMessage,
  pythonRepr,
  pythonStr,
  typeMessage,
} from "./pydantic-messages.ts";

type IssueKind =
  | "missing"
  | "type"
  | "choice"
  | "too_short"
  | "too_long"
  | "range"
  | "format"
  | "tag_missing"
  | "tag_invalid"
  | "other";

/** Pydantic 오류 하나에 해당하는 것. */
interface Issue {
  /** 오류가 난 위치. 판별자 오류는 판별자를 가진 객체(유니온)의 위치다. */
  readonly pointer: string;
  readonly kind: IssueKind;
  /** Pydantic의 메시지. 에러 객체의 detail이 된다. */
  readonly message: string;
  /** 번역 변수(meta.params). FastAPI가 Pydantic ctx에서 옮기는 이름(min, max, gt, lt, expected)이다. */
  readonly params?: Readonly<Record<string, unknown>>;
  /** 판별자 오류의 판별자 속성 이름. */
  readonly tag?: string;
}

/** 같은 위치의 Issue 가운데 남길 것. 작을수록 앞선다. */
const PRIORITY: Readonly<Record<IssueKind, number>> = {
  tag_missing: 0,
  tag_invalid: 0,
  choice: 1,
  type: 2,
  missing: 3,
  too_short: 3,
  too_long: 3,
  range: 3,
  format: 3,
  other: 3,
};

/** Pydantic 오류 종류 → 에러 코드(errors.py의 _VALIDATION_CODES). 없으면 validation.invalid_format이다. */
const VALIDATION_CODES: Partial<Record<IssueKind, ErrorCode>> = {
  missing: "validation.required",
  too_short: "validation.too_short",
  too_long: "validation.too_long",
  range: "validation.out_of_range",
  choice: "validation.invalid_choice",
};

/** 필드 검증 오류(422)로 보는 위치. 그 밖의 본문 오류는 문서 구조 오류(400)다. */
const FIELD_PREFIXES = ["/data/attributes/", "/data/relationships/"];
/** 판별 유니온이 이 위치 아래에 있으면 판별자 오류가 그 필드의 422다. */
const FIELD_OWNERS = ["/data/attributes", "/data/relationships"];

function choice(pointer: string, values: readonly unknown[]): Issue {
  const expected = expectedText(values);
  return { pointer, kind: "choice", message: `Input should be ${expected}`, params: { expected } };
}

function length(pointer: string, keyword: string, limit: number, value: unknown): Issue {
  const shorter = keyword.startsWith("min");
  const kind = shorter ? "too_short" : "too_long";
  const bound = shorter ? "at least" : "at most";
  const params = shorter ? { min: limit } : { max: limit };
  if (keyword.endsWith("Length")) {
    return {
      pointer,
      kind,
      message: `String should have ${bound} ${counted(limit, "character")}`,
      params,
    };
  }
  const actual = Array.isArray(value) ? String(value.length) : "?";
  const message = `List should have ${bound} ${counted(limit, "item")} after validation, not ${actual}`;
  return { pointer, kind, message, params };
}

function range(pointer: string, bound: string, params: Record<string, number>): Issue {
  return { pointer, kind: "range", message: `Input should be ${bound}`, params };
}

/** 판별자가 없거나(tag_missing) 모르는 값(tag_invalid)이다. 위치는 유니온 객체다. */
function tagIssue(
  owner: string,
  params: Record<string, unknown>,
  root: SchemaObject,
  document: unknown,
): Issue {
  const tag = String(params.tag);
  const names = discriminatorNames(tag);
  if (params.tagValue === undefined) {
    const message = `Unable to extract tag using discriminator ${names}`;
    return { pointer: owner, kind: "tag_missing", tag, message };
  }
  const { schema } = locate(root, document, owner);
  const union = schema === undefined ? undefined : discriminatedUnion(schema);
  const tags = (union?.members ?? []).flatMap((member) =>
    allowedValues(propertySchema(member, tag)),
  );
  const message =
    `Input tag '${pythonStr(params.tagValue)}' found using ${names} does not match any of the ` +
    `expected tags: ${tags.map(pythonRepr).join(", ")}`;
  return { pointer: owner, kind: "tag_invalid", tag, message };
}

/** Ajv 오류 하나 → Issue 하나. 버릴 오류(null 가지, anyOf·oneOf 요약)는 undefined다. */
function toIssue(error: AjvError, document: unknown, root: SchemaObject): Issue | undefined {
  const pointer = error.instancePath;
  const params: Record<string, unknown> = error.params;
  const limit = Number(params.limit);
  const value = valueAt(document, pointer);
  switch (error.keyword) {
    case "required": {
      const missing = escapeSegment(String(params.missingProperty));
      return { pointer: `${pointer}/${missing}`, kind: "missing", message: "Field required" };
    }
    case "type":
      if (params.type === "null") return undefined;
      return { pointer, kind: "type", message: typeMessage(String(params.type), value) };
    case "enum":
      return choice(pointer, Array.isArray(params.allowedValues) ? params.allowedValues : []);
    case "const":
      return choice(pointer, [params.allowedValue]);
    case "minLength":
    case "maxLength":
    case "minItems":
    case "maxItems":
      return length(pointer, error.keyword, limit, value);
    case "minimum":
      return range(pointer, `greater than or equal to ${String(limit)}`, { min: limit });
    case "exclusiveMinimum":
      return range(pointer, `greater than ${String(limit)}`, { gt: limit });
    case "maximum":
      return range(pointer, `less than or equal to ${String(limit)}`, { max: limit });
    case "exclusiveMaximum":
      return range(pointer, `less than ${String(limit)}`, { lt: limit });
    case "format":
      return { pointer, kind: "format", message: formatMessage(String(params.format), value) };
    case "pattern": {
      const message = `String should match pattern '${String(params.pattern)}'`;
      return { pointer, kind: "other", message };
    }
    case "discriminator":
      return tagIssue(pointer, params, root, document);
    case "anyOf":
    case "oneOf":
      return undefined;
    default:
      return { pointer, kind: "other", message: error.message ?? `Invalid ${error.keyword}` };
  }
}

/** 위치마다 PRIORITY가 가장 앞선 Issue 하나만 남긴다. */
function onePerLocation(issues: readonly Issue[]): Issue[] {
  const chosen = new Map<string, Issue>();
  for (const issue of issues) {
    const current = chosen.get(issue.pointer);
    if (current === undefined || PRIORITY[issue.kind] < PRIORITY[current.kind]) {
      chosen.set(issue.pointer, issue);
    }
  }
  return [...chosen.values()];
}

interface Placed {
  readonly status: ErrorStatus;
  readonly object: ErrorObject;
}

/** Issue → 상태와 에러 객체(errors.py의 _body_error). 클라이언트가 만든 id(403)는 검증 전에 본다. */
function place(issue: Issue, document: unknown): Placed {
  const { pointer, kind, message } = issue;
  const isTag = kind === "tag_missing" || kind === "tag_invalid";
  const typeMismatch = kind === "choice" && typeof valueAt(document, pointer) === "string";
  if (pointer === "/data/type" && typeMismatch) {
    return { status: 409, object: errorObject(409, "resource.conflict", message, { pointer }) };
  }
  if (isTag && FIELD_OWNERS.some((owner) => pointer.startsWith(owner))) {
    const field = `${pointer}/${escapeSegment(issue.tag ?? "")}`;
    const code = kind === "tag_missing" ? "validation.required" : "validation.invalid_choice";
    return { status: 422, object: errorObject(422, code, message, { pointer: field }) };
  }
  if (!isTag && FIELD_PREFIXES.some((prefix) => pointer.startsWith(prefix))) {
    const code = VALIDATION_CODES[kind] ?? "validation.invalid_format";
    const params = issue.params === undefined ? {} : { params: issue.params };
    return { status: 422, object: errorObject(422, code, message, { pointer, ...params }) };
  }
  return {
    status: 400,
    object: errorObject(400, "jsonapi.invalid_document", message, { pointer }),
  };
}

function compareKeys(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export interface DocumentErrors {
  /** 응답 상태. 에러 객체의 상태가 하나면 그 상태이고, 섞이면 가장 일반적인 400이다. */
  readonly status: ErrorStatus;
  readonly errors: readonly ErrorObject[];
}

/** Ajv 오류 → FastAPI와 같은 응답 상태와 에러 객체들(errors.py의 validation_error_objects). */
export function documentErrors(
  root: SchemaObject,
  document: unknown,
  errors: readonly AjvError[],
): DocumentErrors {
  const placed = onePerLocation(errors.flatMap((error) => toIssue(error, document, root) ?? []))
    .map((issue) => place(issue, document))
    .map((entry) => {
      const { key } = locate(root, document, entry.object.source?.pointer ?? "");
      return { ...entry, key };
    })
    .sort((left, right) => compareKeys(left.key, right.key));
  if (placed.length === 0) {
    // Ajv가 옮길 수 없는 오류만 냈다. 문서 전체의 구조 오류로 알린다.
    const detail = "Invalid request document.";
    return {
      status: 400,
      errors: [errorObject(400, "jsonapi.invalid_document", detail, { pointer: "" })],
    };
  }
  const statuses = new Set(placed.map((entry) => entry.status));
  const [only] = statuses;
  return {
    status: statuses.size === 1 && only !== undefined ? only : 400,
    errors: placed.map((entry) => entry.object),
  };
}
