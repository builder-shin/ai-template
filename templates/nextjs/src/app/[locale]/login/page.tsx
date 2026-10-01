import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm, loginAction, resendVerificationAction } from "../../../features/auth";
import { loginPath, safeReturnTo } from "../../../lib/session/redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[]; notice?: string | string[] }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : undefined);
  const locale = await getLocale();
  const reauthentication = params.notice === "reauthentication";
  const oauthNotice =
    params.notice === "auth.oauth_denied" || params.notice === "auth.oauth_failed"
      ? params.notice
      : undefined;
  const t = await getTranslations({ locale, namespace: "errors" });
  return (
    <>
      {(reauthentication || oauthNotice) && (
        <p role="alert" className="mx-auto mb-6 max-w-sm text-sm">
          {t(oauthNotice ?? "auth.reauthentication_required")}
        </p>
      )}
      <LoginForm
        loginAction={loginAction.bind(null, returnTo)}
        resendAction={resendVerificationAction}
        returnTo={returnTo}
        permalink={`${loginPath(returnTo, locale)}${reauthentication ? "&notice=reauthentication" : ""}`}
      />
    </>
  );
}
