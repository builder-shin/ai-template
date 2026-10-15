import { parseDocument } from "yaml";

function hidden(source) {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error("hoist YAML이 올바르지 않다.");
  const entries = doc.toJS()?.hoistedDependencies;
  if (!entries || typeof entries !== "object") throw new Error("hoist 목록이 없다.");
  const values = new Map();
  for (const [key, names] of Object.entries(entries)) {
    const match = /^(?:@[^/]+\/[^@]+|[^@]+)@([^()]+)(?:\(.*\))?$/.exec(key);
    if (!match) throw new Error(`hoist 버전이 올바르지 않다: ${key}`);
    for (const [name, visibility] of Object.entries(names)) {
      if (visibility !== "private") continue;
      if (values.has(name)) throw new Error(`hoist 이름이 중복됐다: ${name}`);
      values.set(name, match[1]);
    }
  }
  return values;
}

export function hoistShadows(comboModulesYaml, standaloneModulesYaml) {
  const combo = hidden(comboModulesYaml),
    standalone = hidden(standaloneModulesYaml);
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
