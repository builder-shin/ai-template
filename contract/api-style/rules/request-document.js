// @ts-check
import { bodySchema, defineRule, jsonApiOperations, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/** @type {Record<string, string>} */
const EXPECTED_SUFFIX = { post: "CreateDocument", patch: "UpdateDocument" };

/**
 * POST 본문은 `*CreateDocument`, PATCH 본문은 `*UpdateDocument`를 참조한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    const suffix = EXPECTED_SUFFIX[method];
    if (suffix === undefined) continue;
    const name = refName(bodySchema(operation.requestBody));
    if (name?.endsWith(suffix)) continue;
    problems.push({
      path: ["paths", path, method, "requestBody"],
      message: `${method.toUpperCase()} 본문은 이름이 "${suffix}"로 끝나는 스키마를 참조한다(현재: ${name ?? "없음"}).`,
    });
  }
  return problems;
}

export default defineRule(check);
