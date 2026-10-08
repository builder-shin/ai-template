import { getLocale, getTranslations } from "next-intl/server";
import { resources } from "@/resources";
import { visibleResources } from "@/lib/resources/access";
import type { ReactNode } from "react";
import { requireAdmin } from "../../../lib/admin/account";
import { AdminShell } from "../../../components/admin-shell";
import { RequestNotice } from "../../../components/request-notice";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  let account;
  try {
    account = await requireAdmin(locale);
  } catch (error) {
    return (
      <main id="main" className="p-8">
        <RequestNotice error={error} locale={locale} />
      </main>
    );
  }
  const t = await getTranslations({ locale });
  const translate = t as (key: string) => string;
  const menu = visibleResources(resources, account.permissions).map((resource) => ({
    href: `/${resource.type}`,
    label: translate(`resources.${resource.type}.title`),
  }));
  return (
    <AdminShell account={{ name: account.name, email: account.email }} menu={menu}>
      {children}
    </AdminShell>
  );
}
