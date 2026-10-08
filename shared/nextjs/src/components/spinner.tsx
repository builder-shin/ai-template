"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "../lib/utils";

export function Spinner({ className }: { className?: string }) {
  const t = useTranslations("accessibility");
  return (
    <Loader2
      role="status"
      aria-label={t("spinner")}
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
    />
  );
}
