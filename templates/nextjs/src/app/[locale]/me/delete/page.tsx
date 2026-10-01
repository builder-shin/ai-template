import { getLocale, getTranslations } from "next-intl/server";
import { DeleteAccountForm, deleteAccountAction } from "../../../../features/me";
import { getPathname, Link } from "../../../../lib/i18n/navigation";

export default async function DeleteAccountPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "me.deletion" });
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <DeleteAccountForm
        action={deleteAccountAction}
        permalink={getPathname({ locale, href: "/me/delete" })}
      />
      <Link href="/me" className="inline-block text-sm underline">
        {t("cancel")}
      </Link>
    </section>
  );
}
