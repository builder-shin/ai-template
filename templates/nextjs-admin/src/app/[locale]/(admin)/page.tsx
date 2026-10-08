import { getTranslations } from "next-intl/server";

export default async function AdminHome() {
  const t = await getTranslations("home");
  return (
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("empty")}</p>
    </section>
  );
}
