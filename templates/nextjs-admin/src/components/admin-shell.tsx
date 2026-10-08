"use client";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "../lib/i18n/navigation";
import { logoutAction } from "../lib/admin/actions";
import { AccountLocaleSwitcher } from "./account-locale-switcher";
import { SubmitButton } from "./submit-button";
import { Button } from "./ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from "./ui/sheet";

export function AdminShell({
  children,
  account,
  menu = [],
}: {
  children: ReactNode;
  account: { name: string | null; email: string | null };
  menu?: readonly { href: string; label: string }[];
}) {
  const t = useTranslations("layout");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger
                render={<Button variant="ghost" size="icon" aria-label={t("openMenu")} />}
              >
                <Menu aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" showCloseButton={false}>
                <SheetHeader className="flex-row items-center justify-between">
                  <SheetTitle>{t("menu")}</SheetTitle>
                  <SheetClose
                    render={<Button variant="ghost" size="icon" aria-label={t("closeMenu")} />}
                  >
                    <X aria-hidden="true" />
                  </SheetClose>
                </SheetHeader>
                <nav aria-label={t("menu")} className="flex flex-col gap-3 p-4">
                  {menu.map((item) => (
                    <SheetClose
                      key={item.href}
                      nativeButton={false}
                      render={<Link href={item.href} role="link" />}
                    >
                      {item.label}
                    </SheetClose>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
          <Link href="/" className="font-semibold">
            {t("brand")}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <p className="font-medium">{account.name?.trim() || t("unnamedUser")}</p>
            <p className="text-muted-foreground">{account.email}</p>
          </div>
          <AccountLocaleSwitcher />
          <form action={logoutAction}>
            <SubmitButton>{t("logout")}</SubmitButton>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r p-4 md:block">
          <nav aria-label={t("menu")} className="flex flex-col gap-3">
            {menu.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
