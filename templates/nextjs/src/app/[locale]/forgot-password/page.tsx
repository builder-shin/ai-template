import { getLocale } from "next-intl/server";
import { PasswordResetRequestForm, requestPasswordResetAction } from "../../../features/auth";

export default async function PasswordResetRequestPage() {
  const locale = await getLocale();
  const prefix = locale === "en" ? "/en" : "";
  return (
    <PasswordResetRequestForm
      requestAction={requestPasswordResetAction}
      permalink={`${prefix}/forgot-password`}
    />
  );
}
