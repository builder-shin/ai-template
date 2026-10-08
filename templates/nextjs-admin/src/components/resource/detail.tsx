import type { ReactNode } from "react";
export function ResourceDetail({
  title,
  fields,
  children,
}: {
  title: string;
  fields: readonly { label: string; value: ReactNode }[];
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {children}
      </div>
      <dl className="grid gap-5">
        {fields.map((field, index) => (
          <div key={index} className="grid gap-1 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium">{field.label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">{field.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
