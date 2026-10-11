import { isRecord } from "./errors.js";
import type { FieldSets } from "./query.js";
export function applySparseFields<T extends object>(document: T, fields: FieldSets): T {
  const result = structuredClone(document);
  if (!isRecord(result)) return result;
  const candidates = [
    ...(Array.isArray(result.data) ? (result.data as unknown[]) : [result.data]),
    ...(Array.isArray(result.included) ? (result.included as unknown[]) : []),
  ];
  for (const resource of candidates) {
    if (!isRecord(resource)) continue;
    const wanted = fields.get(String(resource.type));
    if (!wanted) continue;
    for (const key of ["attributes", "relationships"]) {
      const values = resource[key];
      if (isRecord(values))
        resource[key] = Object.fromEntries(
          Object.entries(values).filter(([name]) => wanted.has(name)),
        );
    }
  }
  return result;
}
