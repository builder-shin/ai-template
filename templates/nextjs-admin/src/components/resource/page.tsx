import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { findScreen, type Screen } from "../../lib/resources/access";
import { createResourceData } from "../../lib/resources/data";
import type { AnyResource } from "../../lib/resources/definition";
import type { ResourceSearchParams } from "../../lib/resources/query";
import { resourceQuery } from "../../lib/resources/query";
import { requireAdmin } from "../../lib/admin/account";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError } from "../../lib/api/errors";
import { redirectOnUnauthorized } from "../../lib/session/request";
import { getEnv } from "../../lib/env";
import { RequestNotice } from "../request-notice";
import { ListScreen, DetailScreen } from "./screen";

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
  if (!resource || (screen !== "list" && screen !== "detail")) notFound();
  const locale = await getLocale();
  try {
    const account = await requireAdmin(locale);
    if (!account.permissions.includes(resource.permission))
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
        Object.entries(normalized).map(([key, value]) => [key, String(value)]),
      );
      for (const [key, kind] of Object.entries(resource.list.filters ?? {}))
        if (kind === "date" && typeof searchParams[key] === "string") {
          const raw = searchParams[key];
          const date = new Date(raw);
          query[key] =
            /^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(date.getTime())
              ? raw
              : new Intl.DateTimeFormat("en-CA", {
                  timeZone: context.timeZone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(date);
        }
      return await ListScreen({ context, document, query });
    }
    if (!id) notFound();
    const document = await data.detail(
      { ...resource, detail: { fields: resource.detail?.fields ?? [] } } as AnyResource,
      id,
    );
    return DetailScreen({ context, document });
  } catch (error) {
    redirectOnUnauthorized(error, locale === "en" ? "/en" : "/");
    if (!(error instanceof ApiError)) throw error;
    return <RequestNotice error={error} locale={locale} />;
  }
}
