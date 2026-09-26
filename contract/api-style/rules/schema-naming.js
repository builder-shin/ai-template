// @ts-check
import { constValue, defineRule, record, resourceName } from "./util.js";

/** @typedef {import("./util.js").Json} Json */
/** @typedef {import("./util.js").Problem} Problem */

/**
 * 스키마가 선언한 JSON:API 리소스 type. 리소스 객체는 type을, 요청 문서는 data.type을 본다.
 * @param {string} name
 * @param {Json} schema
 * @returns {string | undefined}
 */
function declaredType(name, schema) {
  if (name.endsWith("Resource")) return constValue(schema, "type");
  if (name.endsWith("CreateDocument") || name.endsWith("UpdateDocument")) {
    return constValue(record(record(schema.properties).data), "type");
  }
  return undefined;
}

/**
 * 스키마 이름은 점이 없고, 공용 목록(`shared` 옵션)에 있거나 리소스 이름으로 시작한다.
 * 리소스 이름은 type의 단수 PascalCase다. 예: audit-logs → AuditLog
 * @param {Json} doc
 * @param {Json} options
 * @returns {Problem[]}
 */
export function check(doc, options) {
  const shared = Array.isArray(options.shared) ? options.shared : [];
  const schemas = Object.entries(record(record(doc.components).schemas));
  /** @type {Problem[]} */
  const problems = [];
  const prefixes = new Set();
  for (const [name, schema] of schemas) {
    const type = declaredType(name, record(schema));
    if (type === undefined) continue;
    const prefix = resourceName(type);
    prefixes.add(prefix);
    if (!name.startsWith(prefix)) {
      problems.push({
        path: ["components", "schemas", name],
        message: `type "${type}"을 선언한 스키마 이름은 "${prefix}"로 시작한다.`,
      });
    }
  }
  for (const [name] of schemas) {
    if (name.includes(".")) {
      problems.push({
        path: ["components", "schemas", name],
        message: `스키마 이름 "${name}"에 점을 쓰지 않는다. TypeSpec에서는 @friendlyName으로 이름을 정한다.`,
      });
      continue;
    }
    if (shared.includes(name) || [...prefixes].some((prefix) => name.startsWith(prefix))) continue;
    problems.push({
      path: ["components", "schemas", name],
      message: `스키마 "${name}"는 리소스 이름(예: Post, AuditLog)으로 시작하거나 공용 목록에 있어야 한다.`,
    });
  }
  return problems;
}

export default defineRule(check);
