import type { APIRequestContext } from "@playwright/test";
import { appEnvironment, extendTarget } from "./app";
import { mockTarget } from "./mock";
import { fastapiTarget, parseFastapiTargetEnv } from "./fastapi";
import { appOrigin } from "../../src/lib/app-config.mjs";

export const webOrigin = appOrigin("e2e");
export const mockOrigin = appOrigin("e2eMock", "127.0.0.1");
export type TargetName = "mock" | "fastapi";
export interface TargetAdapter {
  mailLink(email: string, purpose: "verification" | "reset"): Promise<string>;
  expireRecentLogin(): Promise<void>;
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
    throw new Error(`APP_URL이 앱 설정과 다르다 — E2E 주소를 넣는다: ${webOrigin}`);
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
    E2E_RECENT_LOGIN_SECONDS: String(config.recentLoginSeconds),
    ...appEnvironment(name, input),
  };
}

export function createTarget(name: TargetName, request: APIRequestContext) {
  const target = name === "fastapi" ? fastapiTarget(request) : mockTarget(request, mockOrigin);
  return extendTarget(name, request, target, mockOrigin);
}
