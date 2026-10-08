import "server-only";
import type { AnyResource } from "./definition";
export type Screen = "list" | "detail" | "create" | "edit";

export function visibleResources(registry: readonly AnyResource[], permissions: readonly string[]) {
  return registry.filter((resource) => permissions.includes(resource.permission));
}
export function findScreen(registry: readonly AnyResource[], type: string, screen: Screen) {
  const resource = registry.find((item) => item.type === type);
  return resource && (screen === "list" || resource[screen]) ? resource : undefined;
}
