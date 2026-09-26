// @ts-check
import { defineRule, jsonApiOperations, record } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * `include` 파라미터와 허용 경로 목록 `x-jsonapi-include`는 항상 함께 선언한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const hasInclude = parameters.some((parameter) => record(parameter).name === "include");
    const paths = operation["x-jsonapi-include"];
    const hasPaths = Array.isArray(paths) && paths.length > 0;
    if (hasInclude && !hasPaths) {
      problems.push({
        path: ["paths", path, method],
        message:
          'include 파라미터가 있으면 허용 경로를 x-jsonapi-include로 선언한다(예: ["author"]).',
      });
    }
    if (!hasInclude && hasPaths) {
      problems.push({
        path: ["paths", path, method, "x-jsonapi-include"],
        message: "x-jsonapi-include를 선언했다면 include 쿼리 파라미터도 선언한다.",
      });
    }
  }
  return problems;
}

export default defineRule(check);
