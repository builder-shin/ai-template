/** JSON:API 미디어 타입과 응답. */

export const JSONAPI_MEDIA_TYPE = "application/vnd.api+json";

/**
 * JSON:API 문서 응답. 성공과 에러가 함께 쓴다. FastAPI의 JsonApiResponse처럼 Content-Type에
 * 매개변수(charset 등)를 붙이지 않고, 본문은 공백 없는 JSON이다.
 */
export function jsonApiResponse(
  document: unknown,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(document), {
    status,
    headers: { ...headers, "Content-Type": JSONAPI_MEDIA_TYPE },
  });
}
