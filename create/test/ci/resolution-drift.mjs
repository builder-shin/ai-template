import { parseAllDocuments } from "yaml";

function importersOf(source) {
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length)) throw new Error("잠금 YAML이 올바르지 않다.");
  const importers = docs.at(-1)?.toJS()?.importers;
  if (!importers || typeof importers !== "object") throw new Error("잠금 importer가 없다.");
  return importers;
}

function resolutions(importers, key) {
  const importer = importers[key];
  if (!importer || typeof importer !== "object") throw new Error(`importer가 없다: ${key}`);
  const values = new Map();
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, entry] of Object.entries(importer[section] ?? {})) {
      if (typeof entry?.version !== "string")
        throw new Error(`importer 해석이 올바르지 않다: ${key}.${name}`);
      if (values.has(name) && values.get(name) !== entry.version)
        throw new Error(`importer 해석이 중복됐다: ${key}.${name}`);
      values.set(name, entry.version);
    }
  }
  return values;
}

export function importerResolutionDiff(beforeLock, afterLock, importers) {
  const before = importersOf(beforeLock),
    after = importersOf(afterLock);
  const result = [];
  for (const importer of [...new Set(importers)].sort()) {
    const left = resolutions(before, importer),
      right = resolutions(after, importer);
    for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const oldValue = left.get(name) ?? "",
        newValue = right.get(name) ?? "";
      if (oldValue !== newValue) result.push({ importer, name, before: oldValue, after: newValue });
    }
  }
  return result;
}
