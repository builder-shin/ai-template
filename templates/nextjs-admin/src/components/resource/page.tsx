import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { findScreen, controlsFor, type Screen } from "../../lib/resources/access";
import { createResourceData } from "../../lib/resources/data";
import type { AnyResource } from "../../lib/resources/definition";
import type { ResourceSearchParams } from "../../lib/resources/query";
import { resourceQuery } from "../../lib/resources/query";
import { filterCalendarDate } from "../../lib/resources/date";
import { requireAdmin } from "../../lib/admin/account";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError } from "../../lib/api/errors";
import { redirectOnUnauthorized } from "../../lib/session/request";
import { getEnv } from "../../lib/env";
import { RequestNotice } from "../request-notice";
import { ListScreen, DetailScreen, FormScreen } from "./screen";

export async function ResourcePage({
  registry,
  type,
  screen,
  id,
  searchParams = {},
}: {
  registry: readonly AnyResource[];
  type: string;
  screen: Screen;
  id?: string;
  searchParams?: ResourceSearchParams;
}) {
  const resource = findScreen(registry, type, screen);
  if (!resource) notFound();
  const locale = await getLocale();
  try {
    const account = await requireAdmin(locale);
    if (
      !account.permissions.includes(resource.permission) ||
      ((screen === "create" || screen === "edit") &&
        !account.permissions.includes(resource[screen]!.permission))
    )
      redirect(locale === "en" ? "/en/forbidden" : "/forbidden");
    const client = await createSessionApiClient({ locale });
    const data = createResourceData(client);
    const t = await getTranslations({ locale });
    const context = {
      resource,
      locale,
      client,
      timeZone: getEnv().TIME_ZONE,
      permissions: account.permissions,
      translate: t as (key: string) => string,
      linkable: (target: string) => {
        const detail = findScreen(registry, target, "detail");
        return Boolean(detail && account.permissions.includes(detail.permission));
      },
    };
    if (screen === "list") {
      const document = await data.list(resource, searchParams);
      const normalized = resourceQuery(resource, searchParams) as Record<string, string | number>;
      const query = Object.fromEntries(
        Object.entries(normalized)
          .filter(([key]) => key !== "include")
          .map(([key, value]) => [key, String(value)]),
      );
      for (const [key, kind] of Object.entries(resource.list.filters ?? {}))
        if (kind === "date" && typeof searchParams[key] === "string") {
          query[key] = filterCalendarDate(searchParams[key], key.endsWith("To]"), context.timeZone);
        }
      return await ListScreen({ context, document, query });
    }
    if (screen === "create") return await FormScreen({ context, mode: "create" });
    if (!id) notFound();
    const document = await data.detail(
      { ...resource, detail: { fields: resource.detail?.fields ?? [] } } as AnyResource,
      id,
    );
    if (screen === "detail") return DetailScreen({ context, document });
    if (!controlsFor(resource, account.permissions, document.data).edit)
      throw new ApiError({
        status: 409,
        errors: [{ code: "resource.conflict", params: {} }],
        traceId: "",
      });
    return await FormScreen({
      context,
      mode: "edit",
      record: document.data,
      included: "included" in document ? (document.included ?? []) : [],
    });
  } catch (error) {
    redirectOnUnauthorized(error, locale === "en" ? "/en" : "/");
    if (!(error instanceof ApiError)) throw error;
    return <RequestNotice error={error} locale={locale} />;
  }
}
