import { format } from "prettier";
import { object, schemaReader, strings } from "./schema";

type Presentation = {
  kind: string;
  values?: string[];
  relation?: { type: string; label: string; search?: boolean };
};
type Form = { permission: string; fields: Record<string, string> };
function placeholders(names: string[]) {
  const result: Record<string, unknown> = {};
  for (const name of names) {
    const parts = name.split(".");
    let current = result;
    for (const part of parts.slice(0, -1)) {
      if (!Object.hasOwn(current, part)) current[part] = {};
      if (typeof current[part] !== "object" || current[part] === null)
        throw new Error(`${name}: 문구 키 충돌 — 접두사와 값이 겹치지 않게 계약을 고친다.`);
      current = current[part] as Record<string, unknown>;
    }
    const key = parts.at(-1)!;
    if (Object.hasOwn(current, key))
      throw new Error(`${name}: 문구 키 충돌 — 접두사와 값이 겹치지 않게 계약을 고친다.`);
    Object.defineProperty(current, key, {
      value: name,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}
export type DraftDefinition = {
  type: string;
  permission: string;
  fields: Record<string, Presentation>;
  list: {
    columns: string[];
    filters?: Record<string, string>;
    sort?: { fields: string[]; default?: string };
    include?: string[];
  };
  detail?: { fields: string[] };
  create?: Form;
  edit?: Form;
  delete?: { permission: string };
};
export function validateType(type: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(type) || type.length > 50)
    throw new Error(`${type}: 리소스 이름이 잘못됐다 — 50자 이하 소문자 kebab-case를 쓴다.`);
}
export async function draftResource(spec: unknown, type: string) {
  validateType(type);
  const { read, properties, property, document } = schemaReader(spec);
  const paths = object(object(spec).paths);
  const path = paths[`/api/v1/${type}`] ? `/api/v1/${type}` : `/${type}`;
  const collection = read(paths[path]);
  const list = read(collection.get);
  if (!collection.get)
    throw new Error(
      `${type}: 목록 operation 없음 — 계약에 목록 경로(GET ${path})를 추가하고 pnpm gen을 실행한다.`,
    );
  const data = property(document(object(read(list.responses))["200"]), "data");
  const record = read(data.items);
  const attributes = properties(property(record, "attributes"));
  const relationships = properties(property(record, "relationships"));
  if (
    data.type !== "array" ||
    !Object.keys(attributes).length ||
    !strings(property(record, "type").enum).includes(type)
  )
    throw new Error(
      `${type}: JSON:API 목록 스키마가 잘못됐다 — data 배열의 type·attributes를 선언한다.`,
    );
  const detail = read(paths[`${path}/{id}`]);
  const query = (operation: Record<string, unknown>, item = collection) => {
    const parameters = new Map<string, Record<string, unknown>>();
    for (const source of [item.parameters, operation.parameters])
      for (const value of Array.isArray(source) ? source : []) {
        const parameter = read(value);
        if (parameter.in === "query" && typeof parameter.name === "string")
          parameters.set(parameter.name, parameter);
      }
    return parameters;
  };
  const parameters = query(list);
  const fields: Record<string, Presentation> = {};
  const presentation = (schema: unknown): Presentation => {
    const value = read(schema);
    const values = strings(value.enum);
    if (values.length) return { kind: "enum", values };
    const items = strings(read(value.items).enum);
    if (value.type === "array" && items.length) return { kind: "enum-many", values: items };
    if (value.type === "boolean") return { kind: "boolean" };
    if (["date", "date-time"].includes(String(value.format))) return { kind: "date" };
    return { kind: "text" };
  };
  for (const [name, value] of Object.entries(attributes)) fields[name] = presentation(value);
  for (const [name, value] of Object.entries(relationships)) {
    const data = property(value, "data");
    const targetType = strings(property(data.type === "array" ? data.items : data, "type").enum)[0];
    if (!targetType)
      throw new Error(`${name}: 관계 대상 type 없음 — 관계 식별자에 type을 선언한다.`);
    const targetPath = paths[`/api/v1/${targetType}`] ? `/api/v1/${targetType}` : `/${targetType}`;
    const target = read(paths[targetPath]);
    const targetGet = read(target.get);
    const targetDetail = read(read(paths[`${targetPath}/{id}`]).get);
    const targetData = property(
      document(object(read((target.get ? targetGet : targetDetail).responses))["200"]),
      "data",
    );
    const targetRecord = read(targetData.type === "array" ? targetData.items : targetData);
    const targetAttributes = properties(property(targetRecord, "attributes"));
    const label =
      ["name", "title", "code", "email", "filename"].find((key) => key in targetAttributes) ??
      Object.keys(targetAttributes)[0];
    if (!label)
      throw new Error(`${name}: 관계 대상의 라벨 속성 없음 — 대상 응답의 attributes를 선언한다.`);
    fields[name] = {
      kind: targetType === "files" ? "file" : data.type === "array" ? "relation-many" : "relation",
      relation: {
        type: targetType,
        label,
        ...(query(targetGet, target).has("filter[q]") ? { search: true } : {}),
      },
    };
  }
  const filters: Record<string, string> = {};
  for (const [key, parameter] of parameters) {
    if (!/^filter\[[^\]]+\]$/.test(key)) continue;
    const name = key.slice(7, -1);
    const kind = presentation(parameter.schema);
    const relationship = fields[name]?.relation;
    filters[key] = relationship
      ? "relation"
      : kind.kind === "enum"
        ? "enum"
        : kind.kind === "date"
          ? "date"
          : "text";
    if (kind.values && name in attributes) fields[name] = kind;
  }
  const columns = [...Object.keys(attributes), ...Object.keys(relationships)];
  const definition: DraftDefinition = {
    type,
    permission: typeof list["x-permission"] === "string" ? list["x-permission"] : "admin:access",
    fields,
    list: { columns, ...(Object.keys(filters).length ? { filters } : {}) },
  };
  if (parameters.has("sort")) {
    const parameter = read(parameters.get("sort")?.schema);
    const candidates = strings(list["x-jsonapi-sort"]);
    const enums = strings(parameter.enum).flatMap((value) =>
      value.split(",").map((field) => field.replace(/^-/, "")),
    );
    const sortFields = [
      ...new Set(
        (candidates.length ? candidates : enums.length ? enums : Object.keys(attributes)).filter(
          (name) => name in attributes,
        ),
      ),
    ];
    const defaultValue = typeof parameter.default === "string" ? parameter.default : undefined;
    if (sortFields.length)
      definition.list.sort = {
        fields: sortFields,
        ...(defaultValue && sortFields.includes(defaultValue.replace(/^-/, ""))
          ? { default: defaultValue }
          : {}),
      };
  }
  if (parameters.has("include")) {
    const candidates = strings(list["x-jsonapi-include"]);
    const include = (candidates.length ? candidates : Object.keys(relationships)).filter(
      (name) => name in relationships,
    );
    if (include.length) definition.list.include = include;
  }
  if (detail.get) definition.detail = { fields: columns };
  for (const [mode, operation] of [
    ["create", collection.post],
    ["edit", detail.patch],
  ] as const) {
    if (!operation) continue;
    const write = read(operation);
    const writeData = property(document(write.requestBody), "data");
    const inputs: Record<string, string> = {};
    for (const [name, value] of Object.entries(properties(property(writeData, "attributes")))) {
      if (!(name in attributes)) continue;
      const display = presentation(value);
      if (display.values) fields[name] = display;
      inputs[name] = ["enum", "enum-many", "boolean"].includes(display.kind)
        ? display.kind
        : "text";
    }
    for (const [name, value] of Object.entries(properties(property(writeData, "relationships"))))
      if (name in relationships)
        inputs[name] = property(value, "data").type === "array" ? "relation-many" : "relation";
    definition[mode] = {
      permission:
        typeof write["x-permission"] === "string" ? write["x-permission"] : "admin:access",
      fields: inputs,
    };
  }
  if (detail.delete) {
    const permission = read(detail.delete)["x-permission"];
    definition.delete = {
      permission: typeof permission === "string" ? permission : "admin:access",
    };
  }
  const names = [...new Set([...columns, ...Object.keys(filters).map((key) => key.slice(7, -1))])];
  const messages = {
    title: type,
    fields: placeholders(names),
    enums: Object.fromEntries(
      Object.entries(fields)
        .filter(([, value]) => value.values?.length)
        .map(([name, value]) => [name, placeholders(value.values!)]),
    ),
  };
  const source = await format(
    `import "server-only";\nimport { defineResource } from "../../lib/resources/definition";\n\n// 계약에서 만든 초안이다. 권한·표시·입력·문구를 확인한다.\nexport default defineResource(${JSON.stringify(definition, null, 2)});\n`,
    { parser: "typescript", printWidth: 100 },
  );
  return { definition, messages, source };
}
