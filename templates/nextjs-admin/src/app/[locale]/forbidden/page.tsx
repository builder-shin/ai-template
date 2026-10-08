import { getLocale, getTranslations } from "next-intl/server";
import { getAccount } from "../../../lib/admin/account";
import { AdminShell } from "../../../components/admin-shell";
import { RequestNotice } from "../../../components/request-notice";
import { logoutAction } from "../../../lib/admin/actions";
import { SubmitButton } from "../../../components/submit-button";

export default async function ForbiddenPage() {
  const locale = await getLocale();
  const t = await getTranslations("forbidden");
  const layout = await getTranslations("layout");
  let account;
  try {
    account = await getAccount(locale);
  } catch (error) {
    return (
      <main id="main" className="p-8">
        <RequestNotice error={error} locale={locale} />
      </main>
    );
  }
  return (
    <AdminShell account={{ name: account.name, email: account.email }}>
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p>{t("description")}</p>
        <form action={logoutAction}>
          <SubmitButton>{layout("logout")}</SubmitButton>
        </form>
      </section>
    </AdminShell>
  );
}
