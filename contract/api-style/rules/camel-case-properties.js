// @ts-check
import { defineRule, isRecord } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;

/**
 * 문서 어디에 있든 스키마 `properties`의 키는 camelCase다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  /**
   * @param {unknown} node
   * @param {(string | number)[]} path
   */
  const visit = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        visit(item, [...path, index]);
      });
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "properties" && isRecord(value)) {
        for (const property of Object.keys(value).filter((name) => !CAMEL_CASE.test(name))) {
          problems.push({
            path: [...path, key, property],
            message: `속성 이름 "${property}"를 camelCase로 바꾼다(예: created_at → createdAt).`,
          });
        }
      }
      visit(value, [...path, key]);
    }
  };
  visit(doc, []);
  return problems;
}

export default defineRule(check);
