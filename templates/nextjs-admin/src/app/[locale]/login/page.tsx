import { getLocale } from "next-intl/server";
import { LoginForm } from "../../../components/login-form";
import { LocaleSwitcher } from "../../../components/locale-switcher";
import { loginAction } from "../../../lib/admin/actions";

export default async function LoginPage() {
  const locale = await getLocale();
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <LocaleSwitcher />
      <LoginForm loginAction={loginAction} permalink={locale === "en" ? "/en/login" : "/login"} />
    </main>
  );
}
