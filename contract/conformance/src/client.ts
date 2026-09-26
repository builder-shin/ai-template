import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/api.ts";
import { MEDIA_TYPE } from "./jsonapi/assertions.ts";

export interface ClientOptions {
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly fetch?: (request: Request) => Promise<Response>;
}

/** 계약 타입으로 만든 JSON:API 클라이언트. 모든 요청에 JSON:API 헤더를 붙인다. */
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
  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
