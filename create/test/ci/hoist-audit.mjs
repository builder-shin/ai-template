import { parseAllDocuments, parseDocument } from "yaml";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function workspaceImporters(source) {
  if (source === undefined) return new Set();
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length)) throw new Error("잠금 YAML이 올바르지 않다.");
  const importers = docs.at(-1)?.toJS()?.importers;
  if (!record(importers)) throw new Error("잠금 importer가 없다.");
  for (const [path, importer] of Object.entries(importers)) {
    if (!path || !record(importer)) throw new Error("잠금 importer가 올바르지 않다.");
  }
  return new Set(Object.keys(importers));
}

function hidden(source, workspaces) {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error("hoist YAML이 올바르지 않다.");
  const entries = doc.toJS()?.hoistedDependencies;
  if (!record(entries)) throw new Error("hoist 목록이 없다.");
  const values = new Map();
  const privateNames = new Set();
  for (const [key, names] of Object.entries(entries)) {
    const match = /^(?:@[^/]+\/[^@]+|[^@]+)@([^()]+)(?:\(.*\))?$/.exec(key);
    if (!match && !workspaces.has(key)) throw new Error(`hoist 버전이 올바르지 않다: ${key}`);
    if (!record(names)) throw new Error(`hoist 이름 목록이 올바르지 않다: ${key}`);
    for (const [name, visibility] of Object.entries(names)) {
      if (!name || (visibility !== "private" && visibility !== "public"))
        throw new Error(`hoist 이름 공개 범위가 올바르지 않다: ${key}`);
      if (visibility !== "private") continue;
      if (privateNames.has(name)) throw new Error(`hoist 이름이 중복됐다: ${name}`);
      privateNames.add(name);
      // 선언된 workspace 링크에는 외부 패키지 버전이 없다. 버전 항목은 항상 비교한다.
      if (match) values.set(name, match[1]);
    }
  }
  return values;
}

export function hoistShadows(comboModulesYaml, standaloneModulesYaml, workspaceLocks) {
  const combo = hidden(comboModulesYaml, workspaceImporters(workspaceLocks?.combo)),
    standalone = hidden(standaloneModulesYaml, workspaceImporters(workspaceLocks?.standalone));
  return {
    shadowed: [...standalone]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([name, version]) =>
        combo.get(name) === version
          ? []
          : [{ name, combo: combo.get(name) ?? "", standalone: version }],
      ),
    apiOnly: [...combo.keys()].filter((name) => !standalone.has(name)).sort(),
  };
}
