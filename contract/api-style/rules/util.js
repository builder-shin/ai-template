// @ts-check

/** @typedef {Record<string, unknown>} Json */
/** @typedef {{ path: (string | number)[], message: string }} Problem */
/** @typedef {{ path: string, method: string, operation: Json }} JsonApiOperation */

export const MEDIA_TYPE = "application/vnd.api+json";
export const API_PREFIX = "/api/v1/";
export const OAUTH_PREFIX = "/api/v1/oauth/";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * @param {unknown} value
 * @returns {value is Json}
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Json}
 */
export function record(value) {
  return isRecord(value) ? value : {};
}

/**
 * JSON:API 규칙을 적용할 operation. `/api/v1` 아래이고 OAuth 리다이렉트가 아닌 것.
 * @param {Json} doc
 * @returns {JsonApiOperation[]}
 */
export function jsonApiOperations(doc) {
  /** @type {JsonApiOperation[]} */
  const found = [];
  for (const [path, item] of Object.entries(record(doc.paths))) {
    if (!path.startsWith(API_PREFIX) || path.startsWith(OAUTH_PREFIX)) continue;
    for (const method of METHODS) {
      const operation = record(item)[method];
      if (isRecord(operation)) found.push({ path, method, operation });
    }
  }
  return found;
}

/**
 * @param {unknown} schema
 * @returns {string | undefined}
 */
export function refName(schema) {
  if (!isRecord(schema) || typeof schema.$ref !== "string") return undefined;
  return schema.$ref.split("/").at(-1);
}

/**
 * components.schemas에서 이름으로 스키마를 찾는다.
 * @param {Json} doc
 * @param {string | undefined} name
 * @returns {Json | undefined}
 */
export function namedSchema(doc, name) {
  if (name === undefined) return undefined;
  const found = record(record(doc.components).schemas)[name];
  return isRecord(found) ? found : undefined;
}

/**
 * `$ref`면 따라가고, 아니면 그대로 돌려준다.
 * @param {Json} doc
 * @param {unknown} schema
 * @returns {Json | undefined}
 */
export function deref(doc, schema) {
  const name = refName(schema);
  if (name !== undefined) return namedSchema(doc, name);
  return isRecord(schema) ? schema : undefined;
}

/**
 * 속성의 단일 값 enum을 돌려준다. 예: { properties: { type: { enum: ["posts"] } } } → "posts"
 * @param {Json | undefined} schema
 * @param {string} property
 * @returns {string | undefined}
 */
export function constValue(schema, property) {
  const values = record(record(schema?.properties)[property]).enum;
  if (!Array.isArray(values) || values.length !== 1) return undefined;
  const [value] = values;
  return typeof value === "string" ? value : undefined;
}

/**
 * 본문의 JSON:API 스키마(`application/vnd.api+json`)를 돌려준다.
 * @param {unknown} body requestBody 또는 response 객체
 * @returns {unknown}
 */
export function bodySchema(body) {
  return record(record(record(body).content)[MEDIA_TYPE]).schema;
}

/**
 * 리소스 type을 스키마 이름 접두사로 바꾼다. 예: audit-logs → AuditLog
 * @param {string} type
 * @returns {string}
 */
export function resourceName(type) {
  const words = type.split("-");
  const last = words.pop() ?? "";
  let singular = last;
  if (last.endsWith("ies")) singular = `${last.slice(0, -3)}y`;
  else if (last.endsWith("sses")) singular = last.slice(0, -2);
  else if (last.endsWith("s")) singular = last.slice(0, -1);
  return [...words, singular].map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
}

/**
 * 문서 전체를 받아 문제 목록을 돌려주는 검사 함수를 Redocly 규칙으로 감싼다.
 * @param {(doc: Json, options: Json) => Problem[]} check
 */
export function defineRule(check) {
  /** @param {Json} options */
  return (options) => ({
    Root: {
      /**
       * @param {Json} root
       * @param {{ report: (problem: { message: string, location: unknown }) => void, location: { child: (path: (string | number)[]) => { key: () => unknown } } }} context
       */
      leave(root, context) {
        for (const problem of check(root, options)) {
          context.report({
            message: problem.message,
            location: context.location.child(problem.path).key(),
          });
        }
      },
    },
  });
}
