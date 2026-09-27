import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/api.ts";
import { MEDIA_TYPE } from "./jsonapi/assertions.ts";
import { ContractViolation, validateResponse } from "./validation.ts";

export interface ClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

/** 모든 응답을 그 operation과 상태 코드의 계약 스키마로 검증한다(FastAPI 설계 F19). */
const contractValidation: Middleware = {
  async onResponse({ request, response, schemaPath }) {
    const text = await response.clone().text();
    let body: unknown;
    try {
      body = text === "" ? undefined : JSON.parse(text);
    } catch {
      const label = `${request.method} ${schemaPath} ${String(response.status)}`;
      throw new ContractViolation([`${label}: 본문이 JSON이 아니다.`]);
    }
    const problems = validateResponse(
      request.method,
      schemaPath,
      response.status,
      response.headers.get("content-type"),
      body,
    );
    if (problems.length > 0) throw new ContractViolation(problems);
    return response;
  },
};

/** 계약 타입으로 만든 JSON:API 클라이언트. 모든 요청에 JSON:API 헤더를 붙이고 모든 응답을 계약으로 검증한다. */
export function createApiClient(options: ClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers: { Accept: MEDIA_TYPE, "Content-Type": MEDIA_TYPE },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const token = options.accessToken;
  if (token !== undefined) {
    const bearer: Middleware = {
      onRequest({ request }) {
        request.headers.set("Authorization", `Bearer ${token}`);
        return request;
      },
    };
    client.use(bearer);
  }
  client.use(contractValidation);
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
