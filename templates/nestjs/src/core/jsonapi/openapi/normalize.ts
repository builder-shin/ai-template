export type JsonSchema = Record<string, unknown>;
/** 실측한 레지스트리 표식과 문자열 키 record 표현만 정리한다. */
export function normalizeSchema(schema: JsonSchema): JsonSchema {
  const result = { ...schema };
  for (const key of ["properties", "patternProperties", "$defs"]) {
    const map = result[key];
    if (typeof map === "object" && map !== null && !Array.isArray(map))
      result[key] = Object.fromEntries(
        Object.entries(map).map(([name, value]) => [name, normalizeChild(value)]),
      );
  }
  for (const key of ["items", "additionalProperties", "unevaluatedProperties", "propertyNames"])
    if (Object.hasOwn(result, key)) result[key] = normalizeChild(result[key]);
  for (const key of ["anyOf", "oneOf", "allOf", "prefixItems"])
    if (Array.isArray(result[key])) result[key] = result[key].map(normalizeChild);
  if (
    typeof result.properties === "object" &&
    result.properties !== null &&
    !Array.isArray(result.properties) &&
    Object.keys(result.properties).length === 0
  )
    delete result.properties;
  const names = result.propertyNames;
  if (
    result.type === "object" &&
    typeof names === "object" &&
    names !== null &&
    !Array.isArray(names) &&
    Object.keys(names).length === 1 &&
    (names as JsonSchema).type === "string" &&
    Object.hasOwn(result, "additionalProperties") &&
    ![
      "properties",
      "patternProperties",
      "allOf",
      "oneOf",
      "anyOf",
      "$ref",
      "unevaluatedProperties",
    ].some((key) => Object.hasOwn(result, key))
  ) {
    result.unevaluatedProperties = result.additionalProperties;
    delete result.additionalProperties;
    delete result.propertyNames;
  }
  if (typeof result.$id === "string" && result.$id.startsWith("#/components/schemas/"))
    delete result.$id;
  if (result.$schema === "https://json-schema.org/draft/2020-12/schema") delete result.$schema;
  return result;
}
function normalizeChild(value: unknown): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? normalizeSchema(value as JsonSchema)
    : value;
}
