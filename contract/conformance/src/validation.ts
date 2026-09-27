import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import ajvFormats from "ajv-formats";
import { parse } from "yaml";

/** ajv-formats는 CommonJS라 NodeNext에서 플러그인 함수가 default에 있다. */
const addFormats = ajvFormats.default;

type Json = Record<string, unknown>;

const CONTRACT_ID = "contract";
const COMPONENT_PREFIX = "#/components/schemas/";

const contractPath = fileURLToPath(new URL("../../openapi.yaml", import.meta.url));
const contract = parse(readFileSync(contractPath, "utf8")) as Json;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 계약 안의 `#/components/schemas/X` 참조를 검증기에 등록한 스키마의 `contract#/$defs/X`로 바꾼다. */
function rewriteRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteRefs);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "$ref" && typeof item === "string" && item.startsWith(COMPONENT_PREFIX)) {
        return [key, `${CONTRACT_ID}#/$defs/${item.slice(COMPONENT_PREFIX.length)}`];
      }
      return [key, rewriteRefs(item)];
    }),
  );
}

const components = isRecord(contract.components) ? contract.components : {};
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: CONTRACT_ID, $defs: rewriteRefs(components.schemas ?? {}) });

function describe(errors: readonly ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) =>
    `${error.instancePath || "/"} ${error.message ?? ""}`.trim(),
  );
}

function run(validate: ValidateFunction, value: unknown): string[] {
  return validate(value) ? [] : describe(validate.errors);
}

/** 계약의 컴포넌트 스키마 하나로 값을 검증한다. */
export function validateSchema(name: string, value: unknown): string[] {
  const validate = ajv.getSchema(`${CONTRACT_ID}#/$defs/${name}`);
  if (validate === undefined) return [`계약에 ${name} 스키마가 없다.`];
  return run(validate, value);
}

const compiled = new Map<string, ValidateFunction>();

function compile(key: string, schema: unknown): ValidateFunction {
  const cached = compiled.get(key);
  if (cached !== undefined) return cached;
  const validate = ajv.compile(rewriteRefs(schema) as Json);
  compiled.set(key, validate);
  return validate;
}

/**
 * operation(메서드와 OpenAPI 경로 템플릿)과 상태 코드로 계약의 응답 스키마를 찾아 본문을 검증한다.
 * 계약에 없는 operation과 상태 코드는 그 자체가 문제다. 본문이 없는 응답(204 등)은 상태만 본다.
 */
export function validateResponse(
  method: string,
  schemaPath: string,
  status: number,
  contentType: string | null,
  body: unknown,
): string[] {
  const label = `${method.toUpperCase()} ${schemaPath}`;
  const paths = isRecord(contract.paths) ? contract.paths : {};
  const item = paths[schemaPath];
  const operation = isRecord(item) ? item[method.toLowerCase()] : undefined;
  if (!isRecord(operation)) return [`${label}는 계약에 없는 operation이다.`];
  const responses = isRecord(operation.responses) ? operation.responses : {};
  const response = responses[String(status)];
  if (!isRecord(response)) return [`${label}는 계약에 ${String(status)} 응답이 없다.`];
  const content = isRecord(response.content) ? response.content : undefined;
  if (content === undefined) return [];
  const mediaType = (contentType ?? "").split(";")[0]?.trim() ?? "";
  const declared = content[mediaType];
  if (!isRecord(declared)) {
    return [`${label} ${String(status)}의 Content-Type ${mediaType || "없음"}은 계약에 없다.`];
  }
  const key = `${label} ${String(status)} ${mediaType}`;
  return run(compile(key, declared.schema ?? {}), body).map((problem) => `${key}: ${problem}`);
}

/** 대상의 응답이 계약과 어긋났다. */
export class ContractViolation extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`계약 위반 ${String(problems.length)}건:\n${problems.join("\n")}`);
    this.name = "ContractViolation";
    this.problems = problems;
  }
}
