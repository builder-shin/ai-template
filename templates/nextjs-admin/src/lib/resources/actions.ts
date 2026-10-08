"use server";
import "server-only";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { resources } from "../../resources";
import { requireAdmin } from "../admin/account";
import { createSessionApiClient } from "../api/session-client";
import { ApiError } from "../api/errors";
import { redirectOnUnauthorized } from "../session/request";
import { findScreen, controlsFor, type Screen } from "./access";
import { createResourceData } from "./data";
import { parseResourceForm, presentation } from "./values";
import { relationOptions } from "./options";
import { resourceFormResult } from "./form-result";
import type { AnyResource } from "./definition";
import type { WriteValues } from "./contract";
import type { ResourceState, ScreenRecord } from "../../components/resource/types";

function denied(
  code: "permission.denied" | "resource.not_found" | "resource.conflict" = "permission.denied",
) {
  return new ApiError({
    status: code === "resource.not_found" ? 404 : 403,
    errors: [{ code, params: {} }],
    traceId: "",
  });
}
function location(type: string, id: string | null, locale: "ko" | "en") {
  return `${locale === "en" ? "/en" : ""}/${type}${id ? `/${encodeURIComponent(id)}` : ""}`;
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
function failure(
  error: unknown,
  locale: "ko" | "en",
  fields: readonly string[] = [],
  values?: Record<string, unknown>,
): ResourceState {
  redirectOnUnauthorized(error, locale === "en" ? "/en" : "/");
  if (!(error instanceof ApiError)) throw error;
  return {
    ...resourceFormResult(error, locale, fields),
    retryAfter: error.retryAfter,
    ...(values ? { values } : {}),
  };
}
async function current(
  resource: AnyResource,
  id: string,
  data: ReturnType<typeof createResourceData>,
) {
  // 수정·동작은 상세 화면의 유무와 관계없이 단건 operation으로 최신 조건을 확인한다.
  return (await data.detail({ ...resource, detail: { fields: [] } } as AnyResource, id))
    .data as ScreenRecord;
}
export async function saveResourceAction(
  type: string,
  mode: "create" | "edit",
  id: string | null,
  _state: ResourceState,
  form: FormData,
): Promise<ResourceState> {
  const locale = await getLocale();
  let inputs: Record<string, unknown> | undefined;
  let target: string;
  try {
    const ctx = await context(type, mode);
    const parsed = parseResourceForm(ctx.resource, mode, form);
    inputs = parsed.inputs;
    if (mode === "edit" && !id) throw denied("resource.not_found");
    if (
      mode === "edit" &&
      !controlsFor(ctx.resource, ctx.permissions, await current(ctx.resource, id!, ctx.data)).edit
    )
      throw denied();
    const document =
      mode === "create"
        ? await ctx.data.create(
            ctx.resource,
            parsed.values as WriteValues<AnyResource["type"], "create">,
          )
        : await ctx.data.update(
            ctx.resource,
            id!,
            parsed.values as WriteValues<AnyResource["type"], "edit">,
          );
    target = location(type, document.data.id, ctx.locale);
    revalidatePath(location(type, null, ctx.locale));
  } catch (error) {
    const resource = findScreen(resources, type, mode);
    return failure(error, locale, Object.keys(resource?.[mode]?.fields ?? {}), inputs);
  }
  redirect(target);
}
export async function deleteResourceAction(type: string, id: string): Promise<ResourceState> {
  const locale = await getLocale();
  try {
    const ctx = await context(type, "list");
    const record = await current(ctx.resource, id, ctx.data);
    if (!controlsFor(ctx.resource, ctx.permissions, record).delete) throw denied();
    await ctx.data.delete(ctx.resource, id);
    revalidatePath(location(type, null, locale));
  } catch (error) {
    return failure(error, locale);
  }
  redirect(location(type, null, locale));
}
export async function runResourceAction(
  type: string,
  name: string,
  id: string,
): Promise<ResourceState> {
  const locale = await getLocale();
  try {
    const ctx = await context(type, "list");
    const record = await current(ctx.resource, id, ctx.data);
    const action = controlsFor(ctx.resource, ctx.permissions, record).actions.find(
      (item) => item.name === name,
    );
    if (!action) throw denied();
    const result = await action.action(id);
    if (result.ok) revalidatePath(location(type, null, locale));
    return result;
  } catch (error) {
    return failure(error, locale);
  }
}
export async function searchResourceOptions(
  type: string,
  screen: Screen,
  name: string,
  query: string,
) {
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
