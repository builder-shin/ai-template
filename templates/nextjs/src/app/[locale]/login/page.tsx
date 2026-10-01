import { getLocale } from "next-intl/server";
import { LoginForm, loginAction, resendVerificationAction } from "../../../features/auth";
import { loginPath, safeReturnTo } from "../../../lib/session/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : undefined);
  const locale = await getLocale();
  return (
    <LoginForm
      loginAction={loginAction.bind(null, returnTo)}
      resendAction={resendVerificationAction}
      permalink={loginPath(returnTo, locale)}
    />
  );
}
