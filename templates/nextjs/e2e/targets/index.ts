import type { APIRequestContext, Page } from "@playwright/test";
import { mockTarget } from "./mock";
import { fastapiTarget, parseFastapiTargetEnv } from "./fastapi";

export const webOrigin = "http://localhost:3100";
export const mockOrigin = "http://127.0.0.1:4110";
export type TargetName = "mock" | "fastapi";
export type SocialProvider = "google" | "kakao" | "naver";
export interface SocialIdentity {
  username: string;
  name: string;
}
export interface TargetAdapter {
  mailLink(email: string, purpose: "verification" | "reset"): Promise<string>;
  expireRecentLogin(): Promise<void>;
  completeSocialLogin(
    page: Page,
    provider: SocialProvider,
    identity: SocialIdentity,
  ): Promise<void>;
  denySocialLogin(page: Page, provider: SocialProvider): Promise<void>;
}

export function targetName(value = process.env.E2E_TARGET ?? "mock"): TargetName {
  if (value !== "mock" && value !== "fastapi") throw new Error(`알 수 없는 E2E_TARGET: ${value}`);
  return value;
}

export function targetEnvironment(
  name: TargetName,
  input: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (name === "mock")
    return {
      E2E_TARGET: name,
      APP_URL: webOrigin,
      API_BASE_URL: `${mockOrigin}/api/v1`,
      NEXT_PUBLIC_REALTIME_URL: mockOrigin,
    };
  const config = parseFastapiTargetEnv(input);
  if (config.webOrigin !== webOrigin)
    throw new Error("APP_URL: E2E web은 http://localhost:3100을 쓴다.");
  let realtime: URL;
  try {
    realtime = new URL(input.NEXT_PUBLIC_REALTIME_URL ?? "");
  } catch {
    throw new Error("NEXT_PUBLIC_REALTIME_URL: FastAPI 실시간 Origin을 설정한다.");
  }
  if (
    !/^https?:$/.test(realtime.protocol) ||
    realtime.username ||
    realtime.password ||
    realtime.hostname.includes("*") ||
    realtime.href !== `${realtime.origin}/`
  )
    throw new Error("NEXT_PUBLIC_REALTIME_URL: FastAPI 실시간 Origin을 설정한다.");
  return {
    E2E_TARGET: name,
    APP_URL: config.webOrigin,
    API_BASE_URL: config.apiBaseUrl,
    NEXT_PUBLIC_REALTIME_URL: realtime.origin,
    E2E_MAILPIT_URL: config.mailpitOrigin,
    E2E_OAUTH_URL: config.oauthOrigin,
    E2E_RECENT_LOGIN_SECONDS: String(config.recentLoginSeconds),
  };
}

export function createTarget(name: TargetName, request: APIRequestContext): TargetAdapter {
  return name === "fastapi" ? fastapiTarget(request) : mockTarget(request, mockOrigin);
}
