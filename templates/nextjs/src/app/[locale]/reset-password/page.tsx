import { getLocale } from "next-intl/server";
import { PasswordResetForm, resetPasswordAction } from "../../../features/auth";

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const locale = await getLocale();
  const prefix = locale === "en" ? "/en" : "";
  const path = `${prefix}/reset-password`;
  return (
    <PasswordResetForm
      token={token}
      resetAction={resetPasswordAction}
      permalink={token ? `${path}?${new URLSearchParams({ token })}` : path}
    />
  );
}
