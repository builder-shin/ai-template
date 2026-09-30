/**
 * 계약(contract/openapi.yaml)의 컴포넌트 스키마. 시작할 때 한 번 읽어 Ajv(JSON Schema 2020-12,
 * ajv-formats)에 등록한다. 요청 문서 검증(validation.ts)과 에러의 위치·순서 계산이 쓴다. 읽은 계약
 * 문서(contract)는 operation 선언(operations.ts)도 쓴다.
 *
 * - 계약 안의 `#/components/schemas/X` 참조는 등록한 스키마의 `contract#/$defs/X`로 바꾼다.
 * - 판별 유니온(oneOf + discriminator, 예: SessionGrant)은 Ajv의 discriminator로 검증한다. Ajv는
 *   discriminator의 mapping을 받지 않는다. 멤버마다 판별자 속성의 enum이 있어 mapping 없이도 같게
 *   판별하므로 뺀다.
 * - 스키마에 없는 멤버는 검증하면서 지운다(removeAdditional). Pydantic 모델이 모르는 필드를 버리는
 *   것(extra="ignore")과 같다. 그래서 검증 함수는 넘긴 값을 바꾼다.
 * - email 형식은 FastAPI(EmailStr)에 가깝게 특수 용도 도메인을 거절한다(email.ts).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { parse } from "yaml";
import { isRecord } from "../json.ts";
import { isEmail } from "./email.ts";
import { childValue, pointerSegments } from "./pointer.ts";

/** ajv-formats는 CommonJS라 NodeNext에서 플러그인 함수가 default에 있다. */
const addFormats = ajvFormats.default;

export type SchemaObject = Readonly<Record<string, unknown>>;

const CONTRACT_PATH = fileURLToPath(new URL("../../../openapi.yaml", import.meta.url));
const COMPONENT_PREFIX = "#/components/schemas/";
const CONTRACT_ID = "contract";

function loadContract(): SchemaObject {
  const contract: unknown = parse(readFileSync(CONTRACT_PATH, "utf8"));
  if (!isRecord(contract)) throw new Error(`${CONTRACT_PATH}가 OpenAPI 문서가 아니다.`);
  return contract;
}

/** 계약 문서(openapi.yaml)를 읽은 값. 경로(operations.ts)와 스키마를 여기서 읽는다. */
export const contract = loadContract();

function loadSchemas(): Readonly<Record<string, SchemaObject>> {
  const components = contract.components;
  const schemas = isRecord(components) ? components.schemas : undefined;
  if (!isRecord(schemas)) throw new Error(`${CONTRACT_PATH}에 components.schemas가 없다.`);
  return Object.fromEntries(
    Object.entries(schemas).filter((entry): entry is [string, SchemaObject] => isRecord(entry[1])),
  );
}

/** 계약의 components.schemas(원본 그대로). */
export const contractSchemas = loadSchemas();

/** Ajv에 등록할 모양: 참조를 등록 id로 바꾸고 discriminator.mapping을 뺀다. */
function forAjv(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(forAjv);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$ref" && typeof item === "string" && item.startsWith(COMPONENT_PREFIX)) {
        return [key, `${CONTRACT_ID}#/$defs/${item.slice(COMPONENT_PREFIX.length)}`];
      }
      if (key === "discriminator" && isRecord(item)) {
        return [
          key,
          Object.fromEntries(Object.entries(item).filter(([name]) => name !== "mapping")),
        ];
      }
      return [key, forAjv(item)];
    }),
  );
}

const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  discriminator: true,
  removeAdditional: "all",
});
addFormats(ajv);
ajv.addFormat("email", { type: "string", validate: isEmail });
ajv.addSchema({ $id: CONTRACT_ID, $defs: forAjv(contractSchemas) });

/** 계약 컴포넌트 스키마의 검증 함수. 처음 부를 때 컴파일하고 Ajv가 기억한다. */
export function contractValidator(name: string): ValidateFunction {
  const validate = ajv.getSchema(`${CONTRACT_ID}#/$defs/${name}`);
  if (validate === undefined) throw new Error(`계약에 ${name} 스키마가 없다.`);
  return validate;
}

/** 참조(`#/components/schemas/X`)를 따라간 스키마. 참조가 아니면 그대로다. */
export function resolveRef(schema: SchemaObject): SchemaObject {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith(COMPONENT_PREFIX)) return schema;
  const target = contractSchemas[ref.slice(COMPONENT_PREFIX.length)];
  if (target === undefined) throw new Error(`계약에 ${ref}가 없다.`);
  return resolveRef(target);
}

function subschemas(schema: SchemaObject, keyword: "anyOf" | "oneOf"): SchemaObject[] {
  const list = schema[keyword];
  return Array.isArray(list) ? list.filter(isRecord).map(resolveRef) : [];
}

/** 스키마가 허용하는 값의 목록(enum 또는 const). */
export function allowedValues(schema: SchemaObject | undefined): readonly unknown[] {
  if (schema === undefined) return [];
  const resolved = resolveRef(schema);
  if (Array.isArray(resolved.enum)) return resolved.enum as unknown[];
  return "const" in resolved ? [resolved.const] : [];
}

/** 판별 유니온의 판별자 속성 이름과 멤버들. 판별 유니온이 아니면 undefined다. */
export function discriminatedUnion(
  schema: SchemaObject,
): { readonly tag: string; readonly members: readonly SchemaObject[] } | undefined {
  const discriminator = schema.discriminator;
  if (!isRecord(discriminator) || typeof discriminator.propertyName !== "string") return undefined;
  return { tag: discriminator.propertyName, members: subschemas(schema, "oneOf") };
}

/** 스키마의 속성 하나. */
export function propertySchema(schema: SchemaObject, name: string): SchemaObject | undefined {
  const properties = schema.properties;
  const property = isRecord(properties) ? properties[name] : undefined;
  return isRecord(property) ? property : undefined;
}

/**
 * 값에 실제로 적용되는 스키마. 참조를 따라가고, 널 허용(anyOf [X, null])은 X로, 판별 유니온은 값의
 * 판별자에 맞는 멤버로 좁힌다(맞는 멤버가 없으면 유니온 그대로다). 계약은 anyOf를 널 허용에만 쓴다.
 */
export function effectiveSchema(schema: SchemaObject, value: unknown): SchemaObject {
  const resolved = resolveRef(schema);
  const nonNull = subschemas(resolved, "anyOf").find((branch) => branch.type !== "null");
  if (nonNull !== undefined) return effectiveSchema(nonNull, value);
  const union = discriminatedUnion(resolved);
  if (union === undefined || !isRecord(value)) return resolved;
  const tagValue = value[union.tag];
  const member = union.members.find((candidate) =>
    allowedValues(propertySchema(candidate, union.tag)).includes(tagValue),
  );
  return member ?? resolved;
}

export interface Location {
  /** 조각마다 스키마 안의 순서: 객체는 properties의 순서, 배열은 인덱스. 모르는 멤버는 맨 뒤다. */
  readonly key: readonly number[];
  /** 그 자리에 적용되는 스키마. 스키마에 없는 자리면 undefined다. */
  readonly schema: SchemaObject | undefined;
}

/**
 * pointer가 가리키는 자리를 스키마에서 찾는다. Pydantic은 모델의 필드 순서대로 검증하고 오류를
 * 내므로, 오류를 key로 정렬하면 FastAPI와 같은 순서가 된다(계약의 properties 순서는 모델의 필드
 * 순서와 같다).
 */
export function locate(root: SchemaObject, document: unknown, pointer: string): Location {
  const key: number[] = [];
  let schema: SchemaObject | undefined = root;
  let value = document;
  for (const segment of pointerSegments(pointer)) {
    const current: SchemaObject | undefined =
      schema === undefined ? undefined : effectiveSchema(schema, value);
    if (current !== undefined && isRecord(current.items)) {
      key.push(Number(segment));
      schema = current.items;
    } else {
      const properties = current?.properties;
      const names = isRecord(properties) ? Object.keys(properties) : [];
      const index = names.indexOf(segment);
      key.push(index === -1 ? names.length : index);
      schema = current === undefined ? undefined : propertySchema(current, segment);
    }
    value = childValue(value, segment);
  }
  return { key, schema: schema === undefined ? undefined : effectiveSchema(schema, value) };
}
