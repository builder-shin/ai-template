import "server-only";
import type { createApiClient } from "../../lib/api/client";
import { ApiError, translateApiError } from "../../lib/api/errors";
import type { AnyResource } from "../../lib/resources/definition";
import type { ScreenRecord, Control, InputProps, FilterProps } from "./types";
import type { ResourceSearchParams } from "../../lib/resources/query";
import { presentation, fieldValue } from "../../lib/resources/values";
import { controlsFor } from "../../lib/resources/access";
import { relationOptions } from "../../lib/resources/options";
import {
  saveResourceAction,
  deleteResourceAction,
  runResourceAction,
  searchResourceOptions,
} from "../../lib/resources/actions";
import { Link } from "../../lib/i18n/navigation";
import { ResourceList } from "./list";
import { ResourceDetail } from "./detail";
import { ResourceForm, ResourceInput } from "./form";
import { ResourceFilters } from "./filters";
import { ResourcePagination } from "./pagination";
import { FieldDisplay } from "./display";
import { ResourceControls } from "./controls";
import { ResourceRealtime } from "./realtime";
import { withCurrentOptions } from "./current-options";

export type ScreenContext = {
  resource: AnyResource;
  permissions: readonly string[];
  locale: "ko" | "en";
  timeZone: string;
  translate: (key: string) => string;
  client: ReturnType<typeof createApiClient>;
  linkable: (type: string) => boolean;
};
export function RecordControls({
  context,
  record,
}: {
  context: ScreenContext;
  record: ScreenRecord;
}) {
  const { resource, permissions, translate: t } = context;
  const shown = controlsFor(resource, permissions, record);
  const controls: Control[] = [
    ...(shown.delete
      ? [
          {
            key: "delete",
            label: t("resource.delete"),
            confirmation: true,
            destructive: true,
            action: deleteResourceAction.bind(null, resource.type, record.id),
          },
        ]
      : []),
    ...shown.actions.map((action) => ({
      key: `action:${action.name}`,
      label: t(`resources.${resource.type}.actions.${action.name}`),
      confirmation: action.confirmation ?? false,
      action: runResourceAction.bind(null, resource.type, action.name, record.id),
    })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      {shown.edit && (
        <Link href={`/${resource.type}/${encodeURIComponent(record.id)}/edit`}>
          {t("resource.edit")}
        </Link>
      )}
      <ResourceControls controls={controls} />
    </div>
  );
}
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
  const { resource, translate: t, permissions } = context;
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
          options = withCurrentOptions(options, query[key], field.relation, document.included);
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
  const createHref =
    resource.create && permissions.includes(resource.create.permission)
      ? `/${resource.type}/new`
      : undefined;
  return (
    <ResourceList
      title={t(`resources.${resource.type}.title`)}
      columns={resource.list.columns.map((name) => t(`resources.${resource.type}.fields.${name}`))}
      {...(createHref ? { createHref } : {})}
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
        controls: <RecordControls context={context} record={record} />,
      }))}
    >
      {resource.realtime && <ResourceRealtime channel={resource.realtime.channel} />}
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
    >
      {resource.realtime && (
        <ResourceRealtime channel={resource.realtime.channel} id={document.data.id} />
      )}
      <RecordControls context={context} record={document.data} />
    </ResourceDetail>
  );
}
export async function FormScreen({
  context,
  mode,
  record,
  included = [],
}: {
  context: ScreenContext;
  mode: "create" | "edit";
  record?: ScreenRecord;
  included?: readonly ScreenRecord[];
}) {
  const { resource, translate: t } = context;
  const inputs = await Promise.all(
    Object.entries(resource[mode]!.fields).map(async ([name, kind]) => {
      const field = presentation(resource, name);
      const raw = record ? fieldValue(record, name) : undefined;
      const value =
        kind === "relation" || kind === "relation-many"
          ? Array.isArray(raw)
            ? raw.map((identifier) => identifier.id)
            : typeof raw === "object" && raw !== null && "id" in raw
              ? raw.id
              : null
          : raw;
      const relation = kind === "relation" || kind === "relation-many";
      let options: InputProps["options"];
      let error: string | undefined;
      if (relation) {
        try {
          options = await relationOptions(context.client, resource, name);
        } catch (problem) {
          if (!(problem instanceof ApiError) || problem.status !== 403) throw problem;
          error = translateApiError(problem, context.locale);
        }
        options = withCurrentOptions(options ?? [], value, field.relation, included);
      } else if (kind === "enum") options = optionValues(context, name);
      const props: InputProps = {
        name,
        kind,
        label: t(`resources.${resource.type}.fields.${name}`),
        defaultValue: value,
        ...(options ? { options } : {}),
        ...(error ? { error, disabled: true } : {}),
        ...(relation && !error && field.relation?.search
          ? { search: searchResourceOptions.bind(null, resource.type, mode, name) }
          : {}),
      };
      const Override = field.input;
      return (
        <ResourceInput key={name} {...props}>
          {Override ? <Override {...props} /> : undefined}
        </ResourceInput>
      );
    }),
  );
  const path = `/${resource.type}${mode === "create" ? "/new" : `/${encodeURIComponent(record!.id)}/edit`}`;
  return (
    <ResourceForm
      title={t(`resources.${resource.type}.title`)}
      action={saveResourceAction.bind(null, resource.type, mode, record?.id ?? null)}
      permalink={`${context.locale === "en" ? "/en" : ""}${path}`}
      cancelHref={`/${resource.type}${resource.detail && record ? `/${encodeURIComponent(record.id)}` : ""}`}
    >
      {inputs}
    </ResourceForm>
  );
}
