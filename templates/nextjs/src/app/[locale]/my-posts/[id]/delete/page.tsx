import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../../../lib/i18n/routing";
import { getPathname } from "../../../../../lib/i18n/navigation";
import { getMyPost, deletePostAction, PostMutationForm } from "../../../../../features/posts";

export default async function DeletePostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const post = await getMyPost(locale, id);
  if (!post) notFound();
  const t = await getTranslations({ locale, namespace: "posts" });
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-8">
      <h1 className="text-3xl font-semibold">{t("deletePost")}</h1>
      <PostMutationForm
        intent="delete"
        title={post.title}
        action={deletePostAction.bind(null, id)}
        permalink={getPathname({ locale, href: `/my-posts/${id}/delete` })}
        cancelHref={`/my-posts/${id}/edit`}
      />
    </section>
  );
}
