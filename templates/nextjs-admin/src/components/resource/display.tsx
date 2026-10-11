import "server-only";
import { Badge } from "../ui/badge";
import { Link } from "../../lib/i18n/navigation";
import type { FieldPresentation } from "../../lib/resources/definition";
import { fieldValue } from "../../lib/resources/values";
import { recordLabel } from "../../lib/resources/labels";
import type { DisplayProps } from "./types";
export function FieldDisplay({
  name,
  field,
  record,
  included,
  locale,
  timeZone,
  translate,
  linkable,
}: Omit<DisplayProps, "value"> & {
  field: FieldPresentation;
  translate: (key: string) => string;
  linkable: (type: string) => boolean;
}) {
  const value = fieldValue(record, name);
  const Override = field.display;
  if (Override)
    return (
      <Override
        name={name}
        value={value}
        record={record}
        included={included}
        locale={locale}
        timeZone={timeZone}
      />
    );
  if (value === null || value === undefined)
    return (
      <span>
        {record.type === "users" && name === "name" ? translate("layout.unnamedUser") : "—"}
      </span>
    );
  const kind =
    field.kind ??
    (record.relationships?.[name]
      ? Array.isArray(value)
        ? "relation-many"
        : "relation"
      : typeof value === "boolean"
        ? "boolean"
        : name.endsWith("At")
          ? "date"
          : "text");
  if (kind === "date" && typeof value === "string") {
    const date = new Date(value);
    return (
      <time dateTime={value}>
        {Number.isNaN(date.getTime())
          ? "—"
          : new Intl.DateTimeFormat(locale, {
              timeZone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(date)}
      </time>
    );
  }
  if (kind === "boolean") return <span>{translate(value ? "resource.yes" : "resource.no")}</span>;
  if (kind === "enum")
    return (
      <Badge variant="secondary">
        {translate(`resources.${record.type}.enums.${name}.${String(value)}`)}
      </Badge>
    );
  if (["relation", "relation-many", "file"].includes(kind)) {
    const identifiers = Array.isArray(value) ? value : [value];
    return (
      <span className="inline-flex flex-wrap gap-2">
        {identifiers.map((identifier: unknown, index) => {
          if (
            typeof identifier !== "object" ||
            identifier === null ||
            !("id" in identifier) ||
            !("type" in identifier)
          )
            return null;
          const linked = included.find(
            (item) => item.id === identifier.id && item.type === identifier.type,
          );
          const label = recordLabel(
            linked,
            field.relation?.label ?? "name",
            String(
              linked?.attributes.title ??
                linked?.attributes.filename ??
                linked?.attributes.originalName ??
                identifier.id,
            ),
            translate("layout.unnamedUser"),
          );
          if (kind === "file" || identifier.type === "file" || identifier.type === "files")
            return <span key={index}>{label}</span>;
          const link = linkable(String(identifier.type)) ? (
            <Link href={`/${String(identifier.type)}/${encodeURIComponent(String(identifier.id))}`}>
              {label}
            </Link>
          ) : (
            label
          );
          return kind === "relation-many" ? (
            <Badge key={index} variant="secondary">
              {link}
            </Badge>
          ) : (
            <span key={index}>{link}</span>
          );
        })}
      </span>
    );
  }
  return (
    <span className={kind === "textarea" ? "whitespace-pre-wrap" : undefined}>{String(value)}</span>
  );
}
