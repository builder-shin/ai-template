import "server-only";
import { headers } from "next/headers";
import { getEnv } from "../env";
import { createApiClient, type ApiClientOptions } from "./client";
import { clientIpFromHeaders } from "./client-ip";

/** 설정이 켜진 요청에서만 ingress의 단일 주소를 선택한다. */
export async function createRequestApiClient(
  options: Omit<ApiClientOptions, "baseUrl" | "clientIp">,
) {
  const env = getEnv();
  const clientIp = env.TRUSTED_CLIENT_IP_HEADER
    ? clientIpFromHeaders(await headers(), env.TRUSTED_CLIENT_IP_HEADER)
    : undefined;
  return createApiClient({
    ...options,
    baseUrl: env.API_BASE_URL,
    // JS 호출자가 타입 경계를 넘어 전달한 옵션도 덮어쓴다.
    clientIp,
  });
}
