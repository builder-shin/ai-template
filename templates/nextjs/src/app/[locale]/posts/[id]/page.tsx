import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "../../../../lib/i18n/routing";
import { getPost, PostDetail } from "../../../../features/posts";

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const post = await getPost(locale, id);
  if (!post) notFound();
  return <PostDetail post={post} />;
}
