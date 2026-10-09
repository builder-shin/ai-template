import type { APIRequestContext } from "@playwright/test";
import type { TargetAdapter, TargetName } from "./index";

export function appEnvironment(
  name: TargetName,
  input: Record<string, string | undefined>,
): Record<string, string> {
  if (name === "mock") return {};
  const output: Record<string, string> = {};
  for (const key of ["E2E_SEED_ADMIN_EMAIL", "E2E_SEED_ADMIN_PASSWORD"]) {
    const value = input[key];
    if (!value?.trim()) throw new Error(`${key}: FastAPI E2E의 시드 관리자 값을 설정한다.`);
    output[key] = value;
  }
  return output;
}
export function mockEnvironment(_origin: string): Record<string, string> {
  return {};
}
export function extendTarget(
  _name: TargetName,
  _request: APIRequestContext,
  target: TargetAdapter,
  _origin: string,
) {
  return target;
}
