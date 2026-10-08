type Node = Record<string, unknown>;
export function object(value: unknown): Node {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Node)
    : {};
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** 로컬 참조와 합성 스키마만 푼다. 순환·외부 참조는 쓰기 전에 거절한다. */
export function schemaReader(spec: unknown) {
  function read(value: unknown, seen = new Set<string>()): Node {
    let node = object(value);
    if (typeof node.$ref === "string") {
      const reference = node.$ref;
      if (!reference.startsWith("#/") || seen.has(reference))
        throw new Error(
          `${reference}: 지원하지 않는 계약 참조 — 로컬의 순환 없는 스키마로 바꾼다.`,
        );
      let target: unknown = spec;
      for (const part of reference.slice(2).split("/"))
        target = object(target)[part.replace(/~1/g, "/").replace(/~0/g, "~")];
      if (target === undefined)
        throw new Error(`${reference}: 계약 참조 없음 — 참조 경로를 고친다.`);
      node = { ...read(target, new Set([...seen, reference])), ...node };
      delete node.$ref;
    }
    for (const branch of Array.isArray(node.allOf) ? node.allOf : []) {
      const resolved = read(branch, seen);
      node = {
        ...resolved,
        ...node,
        properties: { ...object(resolved.properties), ...object(node.properties) },
      };
    }
    for (const key of ["anyOf", "oneOf"]) {
      const variants = node[key];
      if (!Array.isArray(variants)) continue;
      const alternatives = variants
        .map((branch) => read(branch, seen))
        .filter((branch) => branch.type !== "null");
      if (alternatives.length === 1) node = { ...alternatives[0], ...node };
    }
    return node;
  }
  const properties = (value: unknown) => object(read(value).properties);
  const property = (value: unknown, key: string) => read(properties(value)[key]);
  const document = (value: unknown) =>
    read(object(read(value).content)["application/vnd.api+json"]);
  return { read, properties, property, document: (value: unknown) => read(document(value).schema) };
}
