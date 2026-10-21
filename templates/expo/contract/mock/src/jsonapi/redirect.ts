/**
 * JSON:API 밖의 리다이렉트 operation(소셜 로그인). FastAPI 템플릿의 RedirectOperation
 * (core/jsonapi/operation.py)과 Starlette의 RedirectResponse와 같다. 성공은 본문 없는 302다.
 *
 * 쿼리 파라미터는 계약의 선언(이름, required, format, pattern)대로 본다. 실패는 400
 * jsonapi.invalid_query이고 source.parameter에 파라미터 이름을 담는다. 먼저 걸린 것 하나만 알린다.
 * 1. 선언하지 않은 파라미터. 제공자가 돌아오는 콜백(callback)은 제공자가 덧붙이는 것(scope 등)을 받는다
 * 2. 선언 순서대로 파라미터마다: 필수인데 없다, 두 번 왔다, 형식 uri(http(s) 절대 주소)가 아니다,
 *    pattern에 값 전체가 맞지 않는다
 */

import { isHttpUrl, quote } from "../core/urls.ts";
import { type QueryParams, queryError, single } from "./query.ts";

/** 리다이렉트 operation의 쿼리 파라미터 선언(계약의 parameters에서 읽는다). */
export interface RedirectParameter {
  readonly name: string;
  readonly required: boolean;
  /** 값 형식. uri는 http(s) 절대 주소다(Python urlparse로 본 스킴과 netloc). */
  readonly format: "uri" | undefined;
  /** 값 전체가 맞아야 하는 정규식(Python의 re.fullmatch). */
  readonly pattern: string | undefined;
}

/** Location에서 인코딩하지 않는 글자(Starlette RedirectResponse의 quote safe). */
const LOCATION_SAFE = ":/%#?=@[]!$&'()*+,;";

function invalid(name: string, detail: string) {
  return queryError("jsonapi.invalid_query", name, detail);
}

function matches(pattern: string, value: string): boolean {
  return new RegExp(`^(?:${pattern})$`, "u").test(value);
}

/**
 * 쿼리 파라미터를 검사하고 선언한 파라미터 가운데 들어온 것(이름 → 값)을 돌려준다. callback이면
 * 선언하지 않은 파라미터를 받는다.
 */
export function parseRedirectQuery(
  query: QueryParams,
  parameters: readonly RedirectParameter[],
  callback: boolean,
): Record<string, string> {
  if (!callback) {
    const unknown = query.names.find((name) => !parameters.some((item) => item.name === name));
    if (unknown !== undefined) throw invalid(unknown, `Unknown query parameter ${unknown}.`);
  }
  const values: Record<string, string> = {};
  for (const { name, required, format, pattern } of parameters) {
    if (!query.names.includes(name)) {
      if (required) throw invalid(name, `Query parameter ${name} is required.`);
      continue;
    }
    const value = single(query, name);
    if (format === "uri" && !isHttpUrl(value)) {
      throw invalid(name, `Query parameter ${name} must be an absolute URL.`);
    }
    if (pattern !== undefined && !matches(pattern, value)) {
      throw invalid(name, `Query parameter ${name} must match ${pattern}.`);
    }
    values[name] = value;
  }
  return values;
}

/**
 * 302 응답(Starlette의 RedirectResponse). Location은 Starlette처럼 인코딩한다: 영문자, 숫자, _.-~와
 * :/%#?=@[]!$&'()*+,;만 그대로 두고 나머지(공백, 한글 등)는 %XX로 쓴다. 본문은 없다.
 */
export function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: quote(location, LOCATION_SAFE) } });
}
