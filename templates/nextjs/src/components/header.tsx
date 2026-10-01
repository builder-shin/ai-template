"use client";

import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { ChevronDown } from "lucide-react";
import { Link } from "../lib/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { Button } from "./ui/button";
import { Spinner } from "./spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function UserMenu({ name }: { name: string }) {
  const t = useTranslations("layout");
  const { pending } = useFormStatus();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" />}
        disabled={pending}
        aria-label={t("userMenu", { name })}
      >
        <span className="max-w-32 truncate">{name}</span>
        {pending ? <Spinner /> : <ChevronDown aria-hidden="true" data-icon="inline-end" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={pending} render={<button type="submit" form="logout-form" />}>
            {t("logout")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header({
  user,
  logoutAction,
}: {
  user: { name: string | null } | null;
  logoutAction: () => Promise<void>;
}) {
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
          <Link
            href="/posts"
            className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            {t("posts")}
          </Link>
          {user && (
            <Link
              href="/me"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("me")}
            </Link>
          )}
          {user && (
            <Link
              href="/my-posts"
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {t("myPosts")}
            </Link>
          )}
          <LocaleSwitcher />
          {user ? (
            <form id="logout-form" action={logoutAction}>
              <UserMenu name={name} />
            </form>
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
