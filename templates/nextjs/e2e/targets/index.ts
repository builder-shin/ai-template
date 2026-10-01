import type { APIRequestContext } from "@playwright/test";
import { mockTarget } from "./mock";

export const webOrigin = "http://localhost:3100";
export const mockOrigin = "http://127.0.0.1:4110";
export type TargetName = "mock" | "fastapi";
export interface TargetAdapter {
  mailLink(email: string, purpose: "verification" | "reset"): Promise<string>;
}

export function targetName(value = process.env.E2E_TARGET ?? "mock"): TargetName {
  if (value !== "mock" && value !== "fastapi") throw new Error(`알 수 없는 E2E_TARGET: ${value}`);
  return value;
}

export function requireImplementedTarget(name: TargetName) {
  if (name === "fastapi") throw new Error("FastAPI E2E 어댑터와 스택 기동은 W4에서 구현한다.");
}

export function createTarget(name: TargetName, request: APIRequestContext): TargetAdapter {
  requireImplementedTarget(name);
  return mockTarget(request, mockOrigin);
}
