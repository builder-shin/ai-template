/** 백엔드가 내보낸 OpenAPI가 계약과 같은 이름·경로를 쓰는지 비교한다. 구조 호환은 breaking.ts(oasdiff)가 본다. */

export interface OpenApiLike {
  readonly paths?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly components?: { readonly schemas?: Readonly<Record<string, unknown>> };
}

export interface Comparison {
  readonly missingSchemas: readonly string[];
  readonly missingOperations: readonly string[];
  readonly extraOperations: readonly string[];
}

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

/** 경로 파라미터 이름을 지운다. 예: /posts/{post_id} → /posts/{} */
export function normalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, "{}");
}

export function operationKeys(spec: OpenApiLike): Set<string> {
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item).filter((key) => METHODS.has(key))) {
      keys.add(`${method.toUpperCase()} ${normalizePath(path)}`);
    }
  }
  return keys;
}

/**
 * 계약의 스키마 이름은 모두 구현에 있어야 한다(구현의 보조 스키마가 더 있는 것은 괜찮다).
 * operation 집합은 정확히 같아야 한다. 경로 파라미터 이름은 달라도 된다.
 */
export function compareSpecs(contract: OpenApiLike, implementation: OpenApiLike): Comparison {
  const implementedSchemas = new Set(Object.keys(implementation.components?.schemas ?? {}));
  const contractOperations = operationKeys(contract);
  const implementedOperations = operationKeys(implementation);
  return {
    missingSchemas: Object.keys(contract.components?.schemas ?? {})
      .filter((name) => !implementedSchemas.has(name))
      .sort(),
    missingOperations: [...contractOperations]
      .filter((key) => !implementedOperations.has(key))
      .sort(),
    extraOperations: [...implementedOperations]
      .filter((key) => !contractOperations.has(key))
      .sort(),
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
  ];
}
