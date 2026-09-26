/** 백엔드 응답이 JSON:API 1.1을 지키는지 검사한다. 각 함수는 문제 목록을 돌려주고, assert*는 문제가 있으면 던진다. */

export const MEDIA_TYPE = "application/vnd.api+json";

type Json = Record<string, unknown>;

const TOP_LEVEL_MEMBERS = new Set(["data", "errors", "meta", "links", "included", "jsonapi"]);

export class JsonApiViolation extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`JSON:API 위반 ${String(problems.length)}건:\n- ${problems.join("\n- ")}`);
    this.name = "JsonApiViolation";
    this.problems = problems;
  }
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwIfAny(problems: readonly string[]): void {
  if (problems.length > 0) throw new JsonApiViolation(problems);
}

function resourceProblems(resource: unknown, where: string): string[] {
  if (!isJson(resource)) return [`${where}: 리소스 객체가 아니다`];
  const problems: string[] = [];
  if (typeof resource.type !== "string") problems.push(`${where}.type: 문자열이어야 한다`);
  if (typeof resource.id !== "string") problems.push(`${where}.id: 문자열이어야 한다`);
  for (const member of ["attributes", "relationships", "links", "meta"]) {
    if (member in resource && !isJson(resource[member])) {
      problems.push(`${where}.${member}: 객체여야 한다`);
    }
  }
  return problems;
}

/** 배열이면 그대로, 아니면 한 원소짜리 배열로 돌려준다. */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [value];
}

/** 주 데이터와 포함 리소스 중 객체인 것만 모은다. */
function resourcesOf(document: Json): Json[] {
  const included = Array.isArray(document.included) ? (document.included as unknown[]) : [];
  return [...asArray(document.data), ...included].filter(isJson);
}

/** 최상위 구조와 리소스 객체 모양을 검사한다. */
export function documentProblems(body: unknown): string[] {
  if (!isJson(body)) return ["문서는 JSON 객체여야 한다"];
  const problems: string[] = [];
  if (!("data" in body) && !("errors" in body) && !("meta" in body)) {
    problems.push("data, errors, meta 중 하나는 있어야 한다");
  }
  if ("data" in body && "errors" in body) problems.push("data와 errors를 함께 담을 수 없다");
  if ("included" in body && !("data" in body)) problems.push("included는 data가 있을 때만 쓴다");
  for (const member of Object.keys(body)) {
    if (!TOP_LEVEL_MEMBERS.has(member) && !member.includes(":")) {
      problems.push(`최상위에 정의되지 않은 멤버 "${member}"가 있다`);
    }
  }
  if (Array.isArray(body.data)) {
    body.data.forEach((resource, index) => {
      problems.push(...resourceProblems(resource, `data[${String(index)}]`));
    });
  } else if (body.data !== null && body.data !== undefined) {
    problems.push(...resourceProblems(body.data, "data"));
  }
  if ("included" in body) {
    if (!Array.isArray(body.included)) problems.push("included는 배열이어야 한다");
    else {
      body.included.forEach((resource, index) => {
        problems.push(...resourceProblems(resource, `included[${String(index)}]`));
      });
    }
  }
  const seen = new Set<string>();
  for (const resource of resourcesOf(body)) {
    const key = `${String(resource.type)}:${String(resource.id)}`;
    if (seen.has(key)) problems.push(`리소스 ${key}가 문서에 두 번 나온다`);
    seen.add(key);
  }
  return problems;
}

/** included의 모든 리소스가 어떤 관계에서든 참조되는지(full linkage) 검사한다. sparse fieldset 요청에는 쓰지 않는다. */
export function linkageProblems(body: unknown): string[] {
  if (!isJson(body) || !Array.isArray(body.included)) return [];
  const referenced = new Set<string>();
  for (const resource of resourcesOf(body)) {
    const relationships = isJson(resource.relationships) ? resource.relationships : {};
    for (const relationship of Object.values(relationships)) {
      const data = isJson(relationship) ? relationship.data : undefined;
      for (const identifier of asArray(data)) {
        if (isJson(identifier))
          referenced.add(`${String(identifier.type)}:${String(identifier.id)}`);
      }
    }
  }
  return body.included
    .filter(isJson)
    .map((resource) => `${String(resource.type)}:${String(resource.id)}`)
    .filter((key) => !referenced.has(key))
    .map((key) => `included의 ${key}를 참조하는 관계가 없다(full linkage 위반)`);
}

/** 에러 문서를 검사한다. status를 주면 모든 에러 객체의 status와 비교한다. */
export function errorDocumentProblems(body: unknown, status?: number): string[] {
  const problems = documentProblems(body);
  if (!isJson(body)) return problems;
  if (!Array.isArray(body.errors) || body.errors.length === 0) {
    return [...problems, "errors는 비어 있지 않은 배열이어야 한다"];
  }
  body.errors.forEach((error, index) => {
    const where = `errors[${String(index)}]`;
    if (!isJson(error)) {
      problems.push(`${where}: 객체가 아니다`);
      return;
    }
    for (const member of ["status", "code", "title"]) {
      if (typeof error[member] !== "string") problems.push(`${where}.${member}: 문자열이어야 한다`);
    }
    if (status !== undefined && error.status !== String(status)) {
      problems.push(`${where}.status: "${String(status)}"여야 한다(현재: ${String(error.status)})`);
    }
  });
  const meta = isJson(body.meta) ? body.meta : {};
  if (typeof meta.traceId !== "string") problems.push("meta.traceId: 문자열이어야 한다");
  return problems;
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

/** 컬렉션 문서의 페이지 링크와 페이지 메타가 일관되는지 검사한다. */
export function collectionProblems(body: unknown): string[] {
  const problems = documentProblems(body);
  if (!isJson(body)) return problems;
  if (!Array.isArray(body.data)) problems.push("컬렉션의 data는 배열이어야 한다");
  const links = isJson(body.links) ? body.links : {};
  for (const key of ["first", "last"]) {
    if (typeof links[key] !== "string") problems.push(`links.${key}: 문자열이어야 한다`);
  }
  for (const key of ["prev", "next"]) {
    if (!isNullableString(links[key])) problems.push(`links.${key}: 문자열 또는 null이어야 한다`);
  }
  const meta = isJson(body.meta) ? body.meta : {};
  const page = isJson(meta.page) ? meta.page : {};
  const { number, size, total, totalPages } = page;
  if (![number, size, total, totalPages].every((value) => Number.isInteger(value))) {
    return [...problems, "meta.page의 number, size, total, totalPages는 정수여야 한다"];
  }
  const [pageNumber, pageSize, count, pages] = [number, size, total, totalPages] as number[];
  if ((pageNumber ?? 0) < 1) problems.push("meta.page.number는 1 이상이어야 한다");
  if (pages !== Math.ceil((count ?? 0) / (pageSize ?? 1))) {
    problems.push("meta.page.totalPages는 ceil(total / size)여야 한다");
  }
  if (Array.isArray(body.data) && body.data.length > (pageSize ?? 0)) {
    problems.push("data의 개수가 meta.page.size보다 많다");
  }
  return problems;
}

/** fields[type]으로 요청한 필드 외에는 attributes와 relationships에 없어야 한다. */
export function sparseFieldsetProblems(
  body: unknown,
  fields: Readonly<Record<string, readonly string[]>>,
): string[] {
  if (!isJson(body)) return ["문서는 JSON 객체여야 한다"];
  const problems: string[] = [];
  for (const resource of resourcesOf(body)) {
    const allowed = fields[String(resource.type)];
    if (allowed === undefined) continue;
    for (const member of ["attributes", "relationships"]) {
      const values = isJson(resource[member]) ? resource[member] : {};
      for (const key of Object.keys(values).filter((name) => !allowed.includes(name))) {
        problems.push(
          `${String(resource.type)}:${String(resource.id)}에 요청하지 않은 필드 ${key}가 있다`,
        );
      }
    }
  }
  return problems;
}

/** 본문이 있는 응답의 Content-Type은 정확히 JSON:API 미디어 타입이어야 한다. */
export function mediaTypeProblems(response: { status: number; headers: Headers }): string[] {
  if (response.status === 202 || response.status === 204) return [];
  const contentType = response.headers.get("content-type");
  return contentType === MEDIA_TYPE
    ? []
    : [`Content-Type은 "${MEDIA_TYPE}"여야 한다(현재: ${contentType ?? "없음"})`];
}

export function assertDocument(body: unknown): void {
  throwIfAny([...documentProblems(body), ...linkageProblems(body)]);
}

export function assertErrorDocument(body: unknown, status?: number): void {
  throwIfAny(errorDocumentProblems(body, status));
}

export function assertCollection(body: unknown): void {
  throwIfAny([...collectionProblems(body), ...linkageProblems(body)]);
}

export function assertSparseFieldset(
  body: unknown,
  fields: Readonly<Record<string, readonly string[]>>,
): void {
  throwIfAny([...documentProblems(body), ...sparseFieldsetProblems(body, fields)]);
}

export function assertMediaType(response: { status: number; headers: Headers }): void {
  throwIfAny(mediaTypeProblems(response));
}
