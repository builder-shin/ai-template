// @ts-check
import { MEDIA_TYPE, defineRule, jsonApiOperations, record } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * `/api/v1` 아래 요청·응답 본문은 JSON:API 미디어 타입만 쓴다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    /** @type {{ at: string[], content: Json }[]} */
    const bodies = [
      { at: ["requestBody", "content"], content: record(record(operation.requestBody).content) },
    ];
    for (const [status, response] of Object.entries(record(operation.responses))) {
      bodies.push({
        at: ["responses", status, "content"],
        content: record(record(response).content),
      });
    }
    for (const { at, content } of bodies) {
      for (const mediaType of Object.keys(content)) {
        if (mediaType === MEDIA_TYPE) continue;
        problems.push({
          path: ["paths", path, method, ...at, mediaType],
          message: `JSON:API 본문은 "${MEDIA_TYPE}"만 쓴다. "${mediaType}"를 "${MEDIA_TYPE}"로 바꾼다.`,
        });
      }
    }
  }
  return problems;
}

export default defineRule(check);
