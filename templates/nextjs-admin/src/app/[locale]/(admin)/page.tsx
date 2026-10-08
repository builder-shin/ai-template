import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { resources } from "@/resources";
import { visibleResources } from "@/lib/resources/access";
import { requireAdmin } from "@/lib/admin/account";
import { RequestNotice } from "@/components/request-notice";

export default async function AdminHome() {
  const locale = await getLocale();
  let account;
  try {
    account = await requireAdmin(locale);
  } catch (error) {
    return <RequestNotice error={error} locale={locale} />;
  }
  const first = visibleResources(resources, account.permissions)[0];
  if (first) redirect(`${locale === "en" ? "/en" : ""}/${first.type}`);
  const t = await getTranslations("home");
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("empty")}</p>
    </section>
  );
}
