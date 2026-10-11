import "server-only";
import type { DisplayProps } from "../../components/resource/types";

export function AuditMetadata({ value }: DisplayProps) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return <span>—</span>;
  const entries = Object.entries(value);
  if (!entries.length) return <span>—</span>;
  return (
    <dl className="grid gap-3">
      {entries.map(([key, item]) => (
        <div key={key} className="grid gap-1">
          <dt className="font-medium break-all">{key}</dt>
          <dd className="whitespace-pre-wrap break-all">
            {typeof item === "string" ? item : JSON.stringify(item, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
