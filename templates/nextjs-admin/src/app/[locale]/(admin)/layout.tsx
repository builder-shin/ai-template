import { getLocale } from "next-intl/server";
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
  return <AdminShell account={{ name: account.name, email: account.email }}>{children}</AdminShell>;
}
