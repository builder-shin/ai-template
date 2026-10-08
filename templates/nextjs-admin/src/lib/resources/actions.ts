"use server";
import "server-only";
import { getLocale } from "next-intl/server";
import { resources } from "../../resources";
import { requireAdmin } from "../admin/account";
import { createSessionApiClient } from "../api/session-client";
import { ApiError } from "../api/errors";
import { findScreen, type Screen } from "./access";
import { createResourceData } from "./data";
import { presentation } from "./values";
import { relationOptions } from "./options";
import type { Option } from "../../components/resource/types";

function denied(code: "permission.denied" | "resource.not_found" = "permission.denied") {
  return new ApiError({
    status: code === "resource.not_found" ? 404 : 403,
    errors: [{ code, params: {} }],
    traceId: "",
  });
}
async function context(type: string, screen: Screen) {
  const locale = await getLocale();
  const resource = findScreen(resources, type, screen);
  if (!resource) throw denied("resource.not_found");
  const account = await requireAdmin(locale);
  if (!account.permissions.includes(resource.permission)) throw denied();
  if (
    (screen === "create" || screen === "edit") &&
    !account.permissions.includes(resource[screen]!.permission)
  )
    throw denied();
  const client = await createSessionApiClient({ locale });
  return {
    locale,
    resource,
    permissions: account.permissions,
    client,
    data: createResourceData(client),
  };
}
export async function searchResourceOptions(
  type: string,
  screen: Screen,
  name: string,
  query: string,
): Promise<Option[]> {
  const ctx = await context(type, screen);
  const keys =
    screen === "list"
      ? Object.keys(ctx.resource.list.filters ?? {}).map((key) => key.slice(7, -1))
      : screen === "create" || screen === "edit"
        ? Object.keys(ctx.resource[screen]!.fields)
        : [];
  if (!keys.includes(name) || !presentation(ctx.resource, name).relation)
    throw denied("resource.not_found");
  return relationOptions(ctx.client, ctx.resource, name, query);
}
