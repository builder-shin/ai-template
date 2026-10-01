import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../lib/i18n/routing";
import { getPathname, Link } from "../../../lib/i18n/navigation";
import {
  getProfile,
  updateProfileAction,
  changePasswordAction,
  ProfileForm,
  PasswordChangeForm,
} from "../../../features/me";

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [profile, t] = await Promise.all([
    getProfile(locale),
    getTranslations({ locale, namespace: "me" }),
  ]);
  const permalink = getPathname({ locale, href: "/me" });
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <Link href="/me/sessions" className="inline-block text-sm underline">
        {t("sessions")}
      </Link>
      <ProfileForm profile={profile} action={updateProfileAction} permalink={permalink} />
      <PasswordChangeForm action={changePasswordAction} permalink={permalink} />
    </section>
  );
}
