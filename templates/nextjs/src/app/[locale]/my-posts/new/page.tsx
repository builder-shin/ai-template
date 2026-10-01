import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../../lib/i18n/routing";
import { Link, getPathname } from "../../../../lib/i18n/navigation";
import { createPostAction, PostEditor } from "../../../../features/posts";

export default async function NewPostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "posts" });
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/my-posts" className="text-sm underline">
        {t("backToMine")}
      </Link>
      <h1 className="text-3xl font-semibold">{t("newPost")}</h1>
      <PostEditor
        action={createPostAction}
        permalink={getPathname({ locale, href: "/my-posts/new" })}
      />
    </section>
  );
}
