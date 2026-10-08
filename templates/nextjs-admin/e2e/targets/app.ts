import type { APIRequestContext } from "@playwright/test";
import type { TargetAdapter, TargetName } from "./index";

export function appEnvironment(
  _name: TargetName,
  _input: Record<string, string | undefined>,
): Record<string, string> {
  return {};
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
