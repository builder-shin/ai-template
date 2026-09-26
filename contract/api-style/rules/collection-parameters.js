// @ts-check
import { bodySchema, defineRule, jsonApiOperations, record, refName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

const REQUIRED = ["page[number]", "page[size]", "sort"];

/**
 * 컬렉션을 돌려주는 GET은 페이지·정렬·필드 선택 파라미터와 `x-jsonapi-sort`를 선언한다.
 * @param {Json} doc
 * @returns {Problem[]}
 */
export function check(doc) {
  /** @type {Problem[]} */
  const problems = [];
  for (const { path, method, operation } of jsonApiOperations(doc)) {
    if (method !== "get") continue;
    const document = refName(bodySchema(record(operation.responses)["200"]));
    if (!document?.endsWith("CollectionDocument")) continue;
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const names = parameters.map((parameter) => record(parameter).name);
    for (const name of REQUIRED.filter((required) => !names.includes(required))) {
      problems.push({
        path: ["paths", path, method, "parameters"],
        message: `컬렉션 GET은 "${name}" 파라미터를 선언한다(JsonApi.PageQuery와 sort를 펼쳐 넣는다).`,
      });
    }
    if (!names.some((name) => typeof name === "string" && name.startsWith("fields["))) {
      problems.push({
        path: ["paths", path, method, "parameters"],
        message: "컬렉션 GET은 주 리소스의 fields[<type>] 파라미터를 선언한다.",
      });
    }
    const sortable = operation["x-jsonapi-sort"];
    if (!Array.isArray(sortable) || sortable.length === 0) {
      problems.push({
        path: ["paths", path, method],
        message: '컬렉션 GET은 정렬 가능한 필드를 x-jsonapi-sort로 선언한다(예: ["createdAt"]).',
      });
    }
  }
  return problems;
}

export default defineRule(check);
