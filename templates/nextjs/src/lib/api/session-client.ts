import "server-only";
import { getEnv } from "../env";
import { readSession } from "../session/request";
import { createApiClient, type ApiClientOptions } from "./client";

/** 요청의 세션 토큰을 연결한다. 토큰 갱신·공유 캐시는 만들지 않는다. */
export async function createSessionApiClient(
  options: Omit<ApiClientOptions, "accessToken" | "baseUrl">,
) {
  const session = await readSession();
  return createApiClient({
    ...options,
    baseUrl: getEnv().API_BASE_URL,
    ...(session ? { accessToken: session.accessToken } : {}),
  });
}
