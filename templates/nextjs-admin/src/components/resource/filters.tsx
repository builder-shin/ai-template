"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "../../lib/i18n/navigation";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { ResourceSelect } from "./select";
import { resourceUrl, type Query } from "./url";
import type { FilterProps, Option } from "./types";

export function ResourceFilters({
  type,
  query,
  filters,
  sort = [],
}: {
  type: string;
  query: Query;
  filters: readonly FilterProps[];
  sort?: readonly Option[];
}) {
  const t = useTranslations("resource");
  const router = useRouter();
  return (
    <form
      key={resourceUrl(type, query, {})}
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const changes: Record<string, string | undefined> = { "page[number]": "1" };
        for (const name of [
          ...filters.filter((item) => !item.disabled).map((item) => item.name),
          "sort",
        ]) {
          const value = data.get(name);
          changes[name] = typeof value === "string" && value ? value : undefined;
        }
        router.push(resourceUrl(type, query, changes));
      }}
    >
      {filters.map((filter) => (
        <div key={filter.name} className="flex flex-col gap-1">
          <Label htmlFor={filter.name}>{filter.label}</Label>
          {filter.kind === "enum" || filter.kind === "relation" ? (
            <ResourceSelect
              name={filter.name}
              label={filter.label}
              options={filter.options ?? []}
              {...(filter.search ? { search: filter.search } : {})}
              disabled={filter.disabled ?? false}
              allowEmpty
              defaultValue={query[filter.name]}
            />
          ) : (
            <Input
              id={filter.name}
              name={filter.name}
              type={filter.kind === "date" ? "date" : "search"}
              defaultValue={typeof query[filter.name] === "string" ? query[filter.name] : ""}
            />
          )}
          {filter.error && (
            <p role="alert" className="text-sm text-destructive">
              {filter.error}
            </p>
          )}
        </div>
      ))}
      {sort.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="sort">{t("sort")}</Label>
          <ResourceSelect
            name="sort"
            label={t("sort")}
            defaultValue={query.sort}
            options={sort.flatMap((option) => [
              { value: option.value, label: t("ascending", { field: option.label }) },
              { value: `-${option.value}`, label: t("descending", { field: option.label }) },
            ])}
          />
        </div>
      )}
      <Button type="submit" variant="outline">
        {t("apply")}
      </Button>
    </form>
  );
}
