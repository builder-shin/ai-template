// @ts-check
import {
  API_PREFIX,
  bodySchema,
  constValue,
  defineRule,
  deref,
  jsonApiOperations,
  record,
} from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * 문서 스키마의 data가 가리키는 리소스 type. 컬렉션이면 배열 항목을 본다.
 * @param {Json} doc
 * @param {unknown} documentSchema
 * @returns {string | undefined}
 */
function dataType(doc, documentSchema) {
  const data = record(record(deref(doc, documentSchema)?.properties).data);
  const resource = data.type === "array" ? deref(doc, data.items) : deref(doc, data);
  return constValue(resource, "type");
}

/**
 * 리소스 type은 경로의 첫 세그먼트와 같다. 예: /api/v1/audit-logs → audit-logs
 * 별칭은 옵션 `aliases`로 준다. 예: { me: "users" }
 * @param {Json} doc
 * @param {Json} options
 * @returns {Problem[]}
 */
export function check(doc, options) {
  const aliases = record(options.aliases);
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const segment = path.slice(API_PREFIX.length).split("/")[0] ?? "";
    const alias = aliases[segment];
    const expected = typeof alias === "string" ? alias : segment;
    /** @type {{ at: (string | number)[], type: string | undefined }[]} */
    const bodies = [
      { at: ["requestBody"], type: dataType(doc, bodySchema(operation.requestBody)) },
    ];
    for (const [status, response] of Object.entries(record(operation.responses))) {
      if (status.startsWith("2")) {
        bodies.push({ at: ["responses", status], type: dataType(doc, bodySchema(response)) });
      }
    }
    for (const { at, type } of bodies) {
      if (type === undefined || type === expected) continue;
      problems.push({
        path: ["paths", path, method, ...at],
        message: `경로 ${path}의 리소스 type은 "${expected}"여야 한다(현재: "${type}").`,
      });
    }
  }
  return problems;
}

export default defineRule(check);
