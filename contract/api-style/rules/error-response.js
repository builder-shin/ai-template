// @ts-check
import { bodySchema, defineRule, jsonApiOperations, record, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * JSON:API operation은 4xx 응답을 하나 이상 선언하고, 모든 4xx·5xx 응답은 ErrorDocument를 참조한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const responses = record(operation.responses);
    const codes = Object.keys(responses);
    if (!codes.some((code) => code.startsWith("4"))) {
      problems.push({
        path: ["paths", path, method, "responses"],
        message: "JSON:API operation은 4xx 에러 응답을 하나 이상 선언한다(예: CommonErrors).",
      });
    }
    for (const code of codes.filter((status) => /^[45]/.test(status))) {
      if (refName(bodySchema(responses[code])) === "ErrorDocument") continue;
      problems.push({
        path: ["paths", path, method, "responses", code],
        message: `${code} 응답은 application/vnd.api+json 본문으로 ErrorDocument를 참조한다.`,
      });
    }
  }
  return problems;
}

export default defineRule(check);
