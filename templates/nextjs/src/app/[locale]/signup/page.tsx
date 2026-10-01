import { getLocale } from "next-intl/server";
import { SignupForm, signupAction, resendVerificationAction } from "../../../features/auth";

export default async function SignupPage() {
  const locale = await getLocale();
  return (
    <SignupForm
      signupAction={signupAction}
      resendAction={resendVerificationAction}
      permalink={locale === "en" ? "/en/signup" : "/signup"}
    />
  );
}
