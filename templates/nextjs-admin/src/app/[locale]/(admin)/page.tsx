import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "../../../lib/admin/account";

export default async function AdminHome() {
  await requireAdmin(await getLocale());
  const t = await getTranslations("home");
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("empty")}</p>
    </section>
  );
}
