import type { OpenApiLike } from "./compare.ts";
export type OpenApiDocument = OpenApiLike;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const maps = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);
const children = new Set([
  "items",
  "additionalProperties",
  "unevaluatedProperties",
  "propertyNames",
  "not",
  "if",
  "then",
  "else",
  "contains",
]);
const arrays = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
/** 문서 설명과 동등한 표현만 정규화한다. required·enum·경계·참조는 제거하지 않는다. */
function normalize(value: unknown): unknown {
  if (!object(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key === "description" || key === "title") continue;
    if (maps.has(key) && object(inner))
      result[key] = Object.fromEntries(
        Object.entries(inner).map(([name, schema]) => [name, normalize(schema)]),
      );
    else if (children.has(key)) result[key] = normalize(inner);
    else if (arrays.has(key) && Array.isArray(inner)) result[key] = inner.map(normalize);
    else result[key] = inner;
  }
  if (Object.hasOwn(result, "const") && !Object.hasOwn(result, "enum")) {
    result.enum = [result.const];
    delete result.const;
  }
  // 단순 객체에서 두 키워드는 같은 추가 속성을 제한한다. 조합·참조는 보존한다.
  if (
    result.type === "object" &&
    !["allOf", "oneOf", "anyOf", "$ref", "if", "then", "else", "dependentSchemas"].some((key) =>
      Object.hasOwn(result, key),
    ) &&
    Object.hasOwn(result, "unevaluatedProperties") &&
    !Object.hasOwn(result, "additionalProperties")
  ) {
    result.additionalProperties = result.unevaluatedProperties;
    delete result.unevaluatedProperties;
  }
  if (
    object(result.propertyNames) &&
    Object.keys(result.propertyNames).length === 1 &&
    result.propertyNames.type === "string"
  )
    delete result.propertyNames;
  if (
    Array.isArray(result.anyOf) &&
    result.anyOf.length === 2 &&
    Object.keys(result).every((key) => key === "anyOf" || key === "format")
  ) {
    const nullBranch: unknown = result.anyOf.find(
      (branch) => object(branch) && branch.type === "null" && Object.keys(branch).length === 1,
    );
    const branch: unknown = result.anyOf.find((branch) => branch !== nullBranch);
    if (
      nullBranch &&
      object(branch) &&
      typeof branch.type === "string" &&
      !Object.hasOwn(branch, "enum") &&
      !Object.hasOwn(branch, "const") &&
      (!Object.hasOwn(branch, "format") ||
        !Object.hasOwn(result, "format") ||
        branch.format === result.format)
    )
      return {
        ...branch,
        ...(Object.hasOwn(result, "format") ? { format: result.format } : {}),
        type: [branch.type, "null"],
      };
  }
  return result;
}
function canonical(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => (key === "enum" ? canonicalData(item) : canonical(item)));
    return ["required", "enum", "type", "anyOf", "oneOf", "allOf"].includes(key)
      ? items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : items;
  }
  if (["default", "examples", "example", "const"].includes(key)) return canonicalData(value);
  return object(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((name) => [name, canonical(value[name], name)]),
      )
    : value;
}
function canonicalData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalData);
  return object(value)
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonicalData(value[key])]),
      )
    : value;
}
const text = (value: unknown) => (value === undefined ? "undefined" : JSON.stringify(value));
export function compareComponents(
  contract: OpenApiDocument,
  implementation: OpenApiDocument,
  options: { subset: boolean },
): string[] {
  const problems: string[] = [];
  const expected = contract.components?.schemas ?? {},
    actual = implementation.components?.schemas ?? {};
  const diff = (a: unknown, b: unknown, path: string): void => {
    const key = path.split("/").at(-1) ?? "";
    if (JSON.stringify(canonical(a, key)) === JSON.stringify(canonical(b, key))) return;
    if (object(a) && object(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort())
        diff(a[key], b[key], path + "/" + key.replace(/~/g, "~0").replace(/\//g, "~1"));
    } else problems.push(path + ": 계약=" + text(a) + ", 구현=" + text(b));
  };
  for (const name of Object.keys(expected).sort()) {
    if (options.subset && !Object.hasOwn(actual, name)) continue;
    diff(normalize(expected[name]), normalize(actual[name]), name);
  }
  return problems;
}
