import { getLocale } from "next-intl/server";
import { LoginForm } from "../../../components/login-form";
import { LocaleSwitcher } from "../../../components/locale-switcher";
import { loginAction } from "../../../lib/admin/actions";
import { safeLoginReturnTo } from "../../../lib/admin/redirect";
import { loginPath } from "../../../lib/session/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = safeLoginReturnTo(
    typeof params.returnTo === "string" ? params.returnTo : undefined,
  );
  const locale = await getLocale();
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <LocaleSwitcher />
      <LoginForm
        loginAction={loginAction.bind(null, returnTo)}
        permalink={loginPath(returnTo, locale)}
      />
    </main>
  );
}
