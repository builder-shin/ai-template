import "server-only";
import type { AnyResource } from "./definition";
import type { ScreenRecord } from "../../components/resource/types";
export type Screen = "list" | "detail" | "create" | "edit";

export function visibleResources(registry: readonly AnyResource[], permissions: readonly string[]) {
  return registry.filter((resource) => permissions.includes(resource.permission));
}
export function findScreen(registry: readonly AnyResource[], type: string, screen: Screen) {
  const resource = registry.find((item) => item.type === type);
  return resource && (screen === "list" || resource[screen]) ? resource : undefined;
}
export function controlsFor(
  resource: AnyResource,
  permissions: readonly string[],
  record: ScreenRecord,
) {
  const allowed = permissions.includes(resource.permission);
  const visible = (condition: unknown) =>
    !condition || (condition as (record: ScreenRecord) => boolean)(record);
  return {
    edit:
      allowed &&
      Boolean(
        resource.edit &&
        permissions.includes(resource.edit.permission) &&
        visible(resource.edit.visible),
      ),
    delete:
      allowed &&
      Boolean(
        resource.delete &&
        permissions.includes(resource.delete.permission) &&
        visible(resource.delete.visible),
      ),
    actions: allowed
      ? (resource.actions ?? []).filter(
          (action) =>
            permissions.includes(action.permission) &&
            (!action.visible || (action.visible as (record: ScreenRecord) => boolean)(record)),
        )
      : [],
  };
}
