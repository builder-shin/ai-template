import { getLocale } from "next-intl/server";
import { VerificationForm, verifyEmailAction } from "../../../features/auth";

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const locale = await getLocale();
  const path = locale === "en" ? "/en/verify-email" : "/verify-email";
  return (
    <VerificationForm
      token={token}
      verifyAction={verifyEmailAction}
      permalink={token ? `${path}?${new URLSearchParams({ token })}` : path}
    />
  );
}
