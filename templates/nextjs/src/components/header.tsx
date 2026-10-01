"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "../lib/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function Header({ user }: { user: { name: string | null } | null }) {
  const t = useTranslations("layout");
  const name = user?.name?.trim() || t("unnamedUser");
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          aria-label={t("home")}
          className="rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("brand")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <LocaleSwitcher />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" />}
                aria-label={t("userMenu", { name })}
              >
                <span className="max-w-32 truncate">{name}</span>
                <ChevronDown aria-hidden="true" data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* 로그아웃 Action은 Task 7에서 연결한다. */}
                <DropdownMenuGroup>
                  <DropdownMenuItem disabled>{t("logout")}</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              href="/login"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
