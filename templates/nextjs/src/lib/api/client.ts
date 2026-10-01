import "server-only";
import { randomBytes } from "node:crypto";
import createClient from "openapi-fetch";
import type { routing } from "../i18n/routing";
import { ApiError } from "./errors";
import { serializeQuery } from "./jsonapi";
import type { ApiPaths } from "./paths";
import { isTraceId } from "./trace";

export type ApiLog = {
  method: string;
  path: string;
  status: number;
  traceId: string;
  durationMs: number;
};

export type ApiClientOptions = {
  baseUrl: string;
  locale: (typeof routing.locales)[number];
  accessToken?: string;
  traceId?: string;
  log?: (entry: ApiLog) => void;
};

/** 요청 문맥과 토큰을 공유 상태에 보관하지 않는다. */
export function createApiClient(options: ApiClientOptions) {
  const traceId = options.traceId ?? randomBytes(16).toString("hex");
  if (!isTraceId(traceId)) {
    throw new Error("trace id는 0이 아닌 32자리 소문자 16진수로 넘긴다.");
  }
  const log = options.log ?? ((entry: ApiLog) => console.info(JSON.stringify(entry)));
  const started = new Map<string, number>();
  const client = createClient<ApiPaths, "application/vnd.api+json">({
    baseUrl: options.baseUrl,
    cache: "no-store",
    bodySerializer: JSON.stringify,
    querySerializer: serializeQuery,
  });
  const finish = (id: string, method: string, path: string, status: number) => {
    const start = started.get(id) ?? performance.now();
    started.delete(id);
    // 실제 URL·쿼리·헤더·본문 대신 계약 경로만 기록한다.
    log({ method, path, status, traceId, durationMs: Math.max(0, performance.now() - start) });
  };
  client.use({
    onRequest({ request, id }) {
      started.set(id, performance.now());
      request.headers.set("Accept", "application/vnd.api+json");
      request.headers.set("Content-Type", "application/vnd.api+json");
      request.headers.set("Accept-Language", options.locale);
      request.headers.set("traceparent", `00-${traceId}-${randomBytes(8).toString("hex")}-01`);
      if (options.accessToken)
        request.headers.set("Authorization", `Bearer ${options.accessToken}`);
      else request.headers.delete("Authorization");
      return new Request(request, { cache: "no-store" });
    },
    async onResponse({ request, response, schemaPath, id }) {
      finish(id, request.method, schemaPath, response.status);
      if (!response.ok) throw await ApiError.fromResponse(response, traceId);
    },
    onError({ request, schemaPath, id }) {
      finish(id, request.method, schemaPath, 0);
      return new ApiError({
        status: 0,
        traceId,
        errors: [{ code: "service.unavailable", params: {} }],
      });
    },
  });
  return client;
}
