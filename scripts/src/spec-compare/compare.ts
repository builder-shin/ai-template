/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로·응답 상태를 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
  readonly [extension: `x-${string}`]: unknown;
}

export interface Comparison {
  readonly missingSchemas: readonly string[];
  readonly missingOperations: readonly string[];
  readonly extraOperations: readonly string[];
  /** 같은 operation에서 계약에만 있는 응답 상태. 예: "DELETE /api/v1/me 422" */
  readonly missingStatuses: readonly string[];
  /** 같은 operation에서 구현에만 있는 응답 상태. 예: "GET /api/v1/oauth/{}/authorize 406" */
  readonly extraStatuses: readonly string[];
  /** 구현에 없거나 계약과 다른 실시간 항목. 예: "x-realtime-events: post.created" */
  readonly realtimeMismatches: readonly string[];
}

/** 계약의 실시간 확장. 항목마다 name이 있고, 설명(description)을 뺀 나머지가 같아야 한다. */
export const REALTIME_EXTENSIONS = [
  "x-realtime-channels",
  "x-realtime-events",
  "x-realtime-messages",
] as const;

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** 경로 파라미터 이름을 지운다. 예: /posts/{post_id} → /posts/{} */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}");
}

/** 두 스펙에서 같은 operation을 짝짓는 키. 예: GET /api/v1/posts/{} */
function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

export function operationKeys(spec: OpenApiLike): Set<string> {
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item).filter((key) => METHODS.has(key))) {
      keys.add(operationKey(method, path));
    }
  }
  return keys;
}

/** operation의 응답 선언(responses)의 키. 응답 선언이 없으면 빈 배열이다. */
function declaredStatuses(operation: unknown): string[] {
  if (typeof operation !== "object" || operation === null) return [];
  const responses = (operation as Record<string, unknown>).responses;
  return typeof responses === "object" && responses !== null ? Object.keys(responses) : [];
}

/** operation마다 선언한 응답 상태의 집합. 키는 operationKeys와 같다. */
export function responseStatuses(spec: OpenApiLike): Map<string, Set<string>> {
  const statuses = new Map<string, Set<string>>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (METHODS.has(method)) {
        statuses.set(operationKey(method, path), new Set(declaredStatuses(operation)));
      }
    }
  }
  return statuses;
}

const SCHEMA_REF_PREFIX = "#/components/schemas/";

/** 계약에서 구현에 있는 operation만 남긴다. 부분 비교(구현 도중)에 쓴다. components는 그대로 둔다. */
export function restrictToImplemented(
  contract: OpenApiLike,
  implementation: OpenApiLike,
): OpenApiLike {
  const implemented = operationKeys(implementation);
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(contract.paths ?? {})) {
    const kept = Object.fromEntries(
      Object.entries(item).filter(
        ([key]) => !METHODS.has(key) || implemented.has(operationKey(key, path)),
      ),
    );
    if (Object.keys(kept).some((key) => METHODS.has(key))) paths[path] = kept;
  }
  return { ...contract, paths };
}

/** paths에서 `$ref`로 닿는 컴포넌트 스키마 이름. 스키마가 다시 참조하는 것도 따라간다. */
export function reachableSchemas(spec: OpenApiLike): Set<string> {
  const schemas = spec.components?.schemas ?? {};
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith(SCHEMA_REF_PREFIX)) {
        const name = value.slice(SCHEMA_REF_PREFIX.length);
        if (!found.has(name)) {
          found.add(name);
          visit(schemas[name]);
        }
      } else {
        visit(value);
      }
    }
  };
  visit(spec.paths);
  return found;
}

/** 객체의 키를 (안쪽까지) 정렬한 값. 배열의 순서는 그대로 둔다. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== "object" || value === null) return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, inner]) => [key, sortedKeys(inner)]));
}

/** 항목을 비교할 문자열. 설명은 빼고, 키 순서는 보지 않는다. */
function withoutDescription(item: unknown): string {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return JSON.stringify(sortedKeys(item));
  }
  const kept = Object.entries(item).filter(([key]) => key !== "description");
  return JSON.stringify(sortedKeys(Object.fromEntries(kept)));
}

function nameOf(item: unknown): string {
  const name =
    typeof item === "object" && item !== null ? (item as Record<string, unknown>).name : undefined;
  return typeof name === "string" ? name : JSON.stringify(item);
}

/**
 * 계약의 실시간 항목(채널, 이벤트, 메시지)이 구현에 같은 모양으로 있는가. oasdiff는 이 확장을 보지 않는다.
 * 항목은 이름으로 짝짓고, 설명을 뺀 모양을 객체의 키 순서와 상관없이 비교한다(배열의 순서는 본다).
 * 구현에 더 있는 항목(프로젝트가 더한 모듈의 이벤트)은 괜찮다.
 */
export function realtimeMismatches(contract: OpenApiLike, implementation: OpenApiLike): string[] {
  const mismatches: string[] = [];
  for (const extension of REALTIME_EXTENSIONS) {
    const expected = contract[extension];
    if (!Array.isArray(expected)) continue;
    const actual = implementation[extension];
    const found = new Map(
      (Array.isArray(actual) ? actual : []).map((item: unknown) => [
        nameOf(item),
        withoutDescription(item),
      ]),
    );
    for (const item of expected) {
      if (found.get(nameOf(item)) !== withoutDescription(item)) {
        mismatches.push(`${extension}: ${nameOf(item)}`);
      }
    }
  }
  return mismatches;
}

/**
 * 양쪽에 모두 있는 operation마다 응답 상태 집합이 같은가. 항목 예: "DELETE /api/v1/me 422"
 * oasdiff는 성공 상태를 뺀 것만 깨는 변경(error)으로 보고, 에러 상태를 더하거나 뺀 것은 info로 둔다.
 * 그래서 선언을 한쪽만 고친 것을 여기서 잡는다.
 * 한쪽에만 있는 operation은 missingOperations와 extraOperations가 알리므로 여기서는 보지 않는다.
 */
export function statusDifferences(
  contract: OpenApiLike,
  implementation: OpenApiLike,
): Pick<Comparison, "missingStatuses" | "extraStatuses"> {
  const implemented = responseStatuses(implementation);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [key, expected] of responseStatuses(contract)) {
    const actual = implemented.get(key);
    if (actual === undefined) continue;
    for (const status of expected) if (!actual.has(status)) missing.push(`${key} ${status}`);
    for (const status of actual) if (!expected.has(status)) extra.push(`${key} ${status}`);
  }
  return { missingStatuses: missing.sort(), extraStatuses: extra.sort() };
}

export interface CompareOptions {
  /** 구현에 있는 operation만 비교한다(구현 도중). 스키마는 그 operation에서 닿는 것만 요구한다. */
  readonly subset?: boolean;
}

/**
 * 계약의 스키마 이름은 모두 구현에 있어야 한다(구현의 보조 스키마가 더 있는 것은 괜찮다).
 * operation 집합은 정확히 같아야 한다. 경로 파라미터 이름은 달라도 된다.
 * 같은 operation은 응답 상태 집합도 정확히 같아야 한다(statusDifferences).
 * 계약의 실시간 항목은 구현에 같은 모양으로 있어야 한다(realtimeMismatches).
 * 부분 모드는 구현에 있는 operation만 남긴 계약과 비교한다. 계약에 없는 operation은 여전히 문제다.
 * 부분 모드는 실시간 항목을 보지 않는다.
 */
export function compareSpecs(
  contract: OpenApiLike,
  implementation: OpenApiLike,
  options: CompareOptions = {},
): Comparison {
  const target =
    options.subset === true ? restrictToImplemented(contract, implementation) : contract;
  const expectedSchemas =
    options.subset === true
      ? [...reachableSchemas(target)]
      : Object.keys(contract.components?.schemas ?? {});
  const implementedSchemas = new Set(Object.keys(implementation.components?.schemas ?? {}));
  const contractOperations = operationKeys(contract);
  const targetOperations = operationKeys(target);
  const implementedOperations = operationKeys(implementation);
  return {
    missingSchemas: expectedSchemas.filter((name) => !implementedSchemas.has(name)).sort(),
    missingOperations: [...targetOperations]
      .filter((key) => !implementedOperations.has(key))
      .sort(),
    extraOperations: [...implementedOperations]
      .filter((key) => !contractOperations.has(key))
      .sort(),
    ...statusDifferences(target, implementation),
    realtimeMismatches: options.subset === true ? [] : realtimeMismatches(contract, implementation),
  };
}

export function describeComparison(result: Comparison): string[] {
  return [
    ...result.missingSchemas.map(
      (name) => `스키마 ${name}가 구현 스펙에 없다. 계약과 같은 이름으로 모델을 만든다.`,
    ),
    ...result.missingOperations.map((key) => `${key}를 구현하지 않았다.`),
    ...result.extraOperations.map(
      (key) =>
        `${key}는 계약에 없다. 플랫폼 기능이면 계약(contract/typespec)에 먼저 추가하고, 프로젝트 전용 기능이면 생성된 프로젝트에서 만든다.`,
    ),
    ...result.missingStatuses.map(
      (item) =>
        `${item} 응답이 구현 스펙에 없다. 계약이 operation에 선언한 응답 상태는 구현도 모두 선언한다.`,
    ),
    ...result.extraStatuses.map(
      (item) =>
        `${item} 응답은 계약에 없다. 백엔드가 실제로 내는 상태면 계약(contract/typespec)에 먼저 선언하고, 아니면 구현의 선언에서 뺀다.`,
    ),
    ...result.realtimeMismatches.map(
      (item) => `${item}가 구현 스펙에 없거나 계약과 다르다. 계약의 실시간 선언과 같게 낸다.`,
    ),
  ];
}
