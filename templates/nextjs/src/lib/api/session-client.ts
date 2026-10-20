import "server-only";
import { readSession } from "../session/request";
import type { ApiClientOptions } from "./client";
import { createRequestApiClient } from "./request-client";

/** 요청의 세션 토큰을 연결한다. 토큰 갱신·공유 캐시는 만들지 않는다. */
export async function createSessionApiClient(
  options: Omit<ApiClientOptions, "accessToken" | "baseUrl" | "clientIp">,
) {
  const session = await readSession();
  return createRequestApiClient({
    ...options,
    ...(session ? { accessToken: session.accessToken } : {}),
  });
}
