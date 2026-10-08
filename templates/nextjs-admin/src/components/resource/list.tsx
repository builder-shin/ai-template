"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../lib/i18n/navigation";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../ui/table";
import { Skeleton } from "../ui/skeleton";
import { buttonVariants } from "../ui/button";

export function ResourceList({
  title,
  columns,
  rows,
  createHref,
  children,
}: {
  title: string;
  columns: readonly string[];
  rows: readonly { id: string; href?: string; cells: readonly ReactNode[]; controls?: ReactNode }[];
  createHref?: string;
  children?: ReactNode;
}) {
  const t = useTranslations("resource");
  const router = useRouter();
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {createHref && (
          <Link href={createHref} className={buttonVariants()}>
            {t("create")}
          </Link>
        )}
      </div>
      {children}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((label, index) => (
              <TableHead key={index}>{label}</TableHead>
            ))}
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                tabIndex={row.href ? 0 : undefined}
                className={row.href ? "cursor-pointer" : undefined}
                onClick={(event) => {
                  if (
                    row.href &&
                    !(event.target as Element).closest("a,button,input,select,textarea,form")
                  )
                    router.push(row.href);
                }}
                onKeyDown={(event) => {
                  if (
                    row.href &&
                    event.target === event.currentTarget &&
                    ["Enter", " "].includes(event.key)
                  ) {
                    event.preventDefault();
                    router.push(row.href);
                  }
                }}
              >
                {row.cells.map((cell, index) => (
                  <TableCell key={index}>
                    {index === 0 && row.href ? <Link href={row.href}>{cell}</Link> : cell}
                  </TableCell>
                ))}
                <TableCell
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  {row.controls}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                {t("empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
export function TableSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <Table aria-busy="true">
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }, (_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-5 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }, (_, i) => (
          <TableRow key={i}>
            {Array.from({ length: columns }, (_, j) => (
              <TableCell key={j}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
