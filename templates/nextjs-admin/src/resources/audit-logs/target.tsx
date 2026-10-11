import "server-only";
import type { DisplayProps } from "../../components/resource/types";
import { Link } from "../../lib/i18n/navigation";

export function AuditTarget({ value, record, linkable }: DisplayProps) {
  if (typeof value !== "string") return <span>—</span>;
  const type = record.attributes.targetType;
  return typeof type === "string" && linkable(type) ? (
    <Link href={`/${type}/${encodeURIComponent(value)}`}>{value}</Link>
  ) : (
    <span>{value}</span>
  );
}
