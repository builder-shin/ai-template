import type { APIRequestContext } from "@playwright/test";
import { httpOrigin } from "./fastapi";
import type { TargetAdapter, TargetName } from "./index";
import { fastapiSocial, mockSocial } from "./social";

/** web만 소셜 제공자를 준비한다. 공통 대상은 OAuth 주소를 요구하지 않는다. */
export function appEnvironment(
  name: TargetName,
  input: Record<string, string | undefined>,
): Record<string, string> {
  if (name === "mock") return {};
  const result = httpOrigin.safeParse(input.E2E_OAUTH_URL);
  if (!result.success) throw new Error("E2E_OAUTH_URL: FastAPI E2E의 OAuth Origin을 설정한다.");
  return { E2E_OAUTH_URL: result.data };
}

export function mockEnvironment(origin: string): Record<string, string> {
  return { OAUTH_REDIRECT_URIS: `${origin}/oauth/callback` };
}

export function extendTarget(
  name: TargetName,
  _request: APIRequestContext,
  target: TargetAdapter,
  origin: string,
) {
  return {
    ...target,
    ...(name === "fastapi" ? fastapiSocial() : mockSocial(origin)),
  };
}
