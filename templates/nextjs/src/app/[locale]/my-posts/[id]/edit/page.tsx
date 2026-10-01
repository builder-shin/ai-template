import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../../../lib/i18n/routing";
import { Link, getPathname } from "../../../../../lib/i18n/navigation";
import {
  getMyPost,
  PostEditor,
  PostMutationForm,
  updatePostAction,
  publishPostAction,
  unpublishPostAction,
} from "../../../../../features/posts";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const post = await getMyPost(locale, id);
  if (!post) notFound();
  const t = await getTranslations({ locale, namespace: "posts" });
  const permalink = getPathname({ locale, href: `/my-posts/${id}/edit` });
  const intent = post.status === "draft" ? "publish" : "unpublish";
  return (
    <section className="mx-auto max-w-3xl space-y-6 py-8">
      <Link href="/my-posts" className="text-sm underline">
        {t("backToMine")}
      </Link>
      <h1 className="text-3xl font-semibold">{t("editPost")}</h1>
      <p className="text-sm text-muted-foreground">{t(post.status)}</p>
      <PostEditor
        action={updatePostAction.bind(null, id)}
        permalink={permalink}
        values={{ title: post.title, body: post.body }}
      />
      <div className="space-y-4 border-t pt-4">
        <PostMutationForm
          intent={intent}
          action={(intent === "publish" ? publishPostAction : unpublishPostAction).bind(null, id)}
          permalink={permalink}
        />
        {post.status === "published" && (
          <Link href={`/posts/${id}`} className="block text-sm underline">
            {t("viewPublic")}
          </Link>
        )}
        <Link href={`/my-posts/${id}/delete`} className="block text-sm text-destructive underline">
          {t("deletePost")}
        </Link>
      </div>
    </section>
  );
}
