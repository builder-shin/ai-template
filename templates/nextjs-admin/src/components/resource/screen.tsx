import "server-only";
import type { createApiClient } from "../../lib/api/client";
import { ApiError, translateApiError } from "../../lib/api/errors";
import type { AnyResource } from "../../lib/resources/definition";
import type { ScreenRecord, FilterProps } from "./types";
import type { ResourceSearchParams } from "../../lib/resources/query";
import { presentation } from "../../lib/resources/values";
import { relationOptions } from "../../lib/resources/options";
import { searchResourceOptions } from "../../lib/resources/actions";
import { ResourceList } from "./list";
import { ResourceDetail } from "./detail";
import { ResourceFilters } from "./filters";
import { ResourcePagination } from "./pagination";
import { FieldDisplay } from "./display";

export type ScreenContext = {
  resource: AnyResource;
  permissions: readonly string[];
  locale: "ko" | "en";
  timeZone: string;
  translate: (key: string) => string;
  client: ReturnType<typeof createApiClient>;
  linkable: (type: string) => boolean;
};
function optionValues(context: ScreenContext, name: string) {
  return (presentation(context.resource, name).values ?? []).map((value) => ({
    value,
    label: context.translate(`resources.${context.resource.type}.enums.${name}.${value}`),
  }));
}
export async function ListScreen({
  context,
  document,
  query,
}: {
  context: ScreenContext;
  document: {
    data: readonly ScreenRecord[];
    included?: readonly ScreenRecord[];
    meta: { page: { number: number; totalPages: number; total: number } };
  };
  query: ResourceSearchParams;
}) {
  const { resource, translate: t } = context;
  const filters: FilterProps[] = await Promise.all(
    Object.entries((resource.list.filters ?? {}) as Record<string, FilterProps["kind"]>).map(
      async ([key, kind]) => {
        const name = key.slice(7, -1);
        const field = presentation(resource, name);
        let options = optionValues(context, name);
        let error: string | undefined;
        if (kind === "relation") {
          try {
            options = await relationOptions(context.client, resource, name);
          } catch (problem) {
            if (!(problem instanceof ApiError) || problem.status !== 403) throw problem;
            error = translateApiError(problem, context.locale);
          }
        }
        return {
          name: key,
          kind,
          label: t(`resources.${resource.type}.fields.${name}`),
          options,
          ...(error ? { error, disabled: true } : {}),
          ...(!error && field.relation?.search
            ? { search: searchResourceOptions.bind(null, resource.type, "list", name) }
            : {}),
        };
      },
    ),
  );
  return (
    <ResourceList
      title={t(`resources.${resource.type}.title`)}
      columns={resource.list.columns.map((name) => t(`resources.${resource.type}.fields.${name}`))}
      rows={document.data.map((record) => ({
        id: record.id,
        ...(resource.detail ? { href: `/${resource.type}/${encodeURIComponent(record.id)}` } : {}),
        cells: resource.list.columns.map((name) => (
          <FieldDisplay
            key={name}
            name={name}
            field={presentation(resource, name)}
            record={record}
            included={document.included ?? []}
            locale={context.locale}
            timeZone={context.timeZone}
            translate={t}
            linkable={context.linkable}
          />
        )),
      }))}
    >
      <ResourceFilters
        type={resource.type}
        query={query}
        filters={filters}
        sort={(resource.list.sort?.fields ?? []).map((value) => ({
          value,
          label: t(`resources.${resource.type}.fields.${value}`),
        }))}
      />
      <ResourcePagination type={resource.type} query={query} page={document.meta.page} />
    </ResourceList>
  );
}
export function DetailScreen({
  context,
  document,
}: {
  context: ScreenContext;
  document: { data: ScreenRecord; included?: readonly ScreenRecord[] };
}) {
  const { resource, translate: t } = context;
  return (
    <ResourceDetail
      title={t(`resources.${resource.type}.title`)}
      fields={(resource.detail?.fields ?? []).map((name) => ({
        label: t(`resources.${resource.type}.fields.${name}`),
        value: (
          <FieldDisplay
            name={name}
            field={presentation(resource, name)}
            record={document.data}
            included={document.included ?? []}
            locale={context.locale}
            timeZone={context.timeZone}
            translate={t}
            linkable={context.linkable}
          />
        ),
      }))}
    />
  );
}
