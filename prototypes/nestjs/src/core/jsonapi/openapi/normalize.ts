import { isRecord } from "../errors.js";
/** Only measured representational artefacts; constraints are retained. */
export function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== "$schema" && k !== "$id")
      .map(([k, v]) => [k, normalizeSchema(v)]),
  );
  if (Array.isArray(out.type)) {
    const types = out.type as unknown[];
    delete out.type;
    out.anyOf = types.map((t) => ({ type: t }));
  }
  if (isRecord(out.properties) && Object.keys(out.properties).length === 0) delete out.properties;
  if (Array.isArray(out.required) && out.required.length === 0) delete out.required;
  if (
    out.type === "object" &&
    !Object.hasOwn(out, "properties") &&
    Object.hasOwn(out, "additionalProperties") &&
    out.additionalProperties !== false
  ) {
    out.unevaluatedProperties = out.additionalProperties === true ? {} : out.additionalProperties;
    delete out.additionalProperties;
  }
  if (
    isRecord(out.propertyNames) &&
    Object.keys(out.propertyNames).length === 1 &&
    out.propertyNames.type === "string"
  )
    delete out.propertyNames;
  return out;
}
/** Comparison-only equivalent spelling and annotation removal, never constraint removal. */
export function comparable(value: unknown): unknown {
  return canonical(value);
}
function canonical(value: unknown, dictionary = false): unknown {
  const node = normalizeSchema(value);
  if (Array.isArray(node)) return node.map((v) => canonical(v));
  if (!isRecord(node)) return node;
  const out = Object.fromEntries(
    Object.entries(node)
      .filter(([k]) => dictionary || (k !== "description" && k !== "title"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [
        k,
        canonical(
          v,
          [
            "properties",
            "patternProperties",
            "$defs",
            "definitions",
            "schemas",
            "mapping",
          ].includes(k),
        ),
      ]),
  );
  for (const key of ["required", "enum"]) {
    if (Array.isArray(out[key]))
      out[key] = [...(out[key] as unknown[])].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      );
  }
  if (Array.isArray(out.anyOf))
    out.anyOf = [...(out.anyOf as unknown[])].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  return out;
}
