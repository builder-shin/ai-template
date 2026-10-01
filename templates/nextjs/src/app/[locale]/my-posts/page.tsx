import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../lib/i18n/routing";
import { Link } from "../../../lib/i18n/navigation";
import { pageLinks } from "../../../lib/api/jsonapi";
import {
  getMyPosts,
  parseMyPostSearch,
  MyPostFilter,
  MyPostList,
  PostPagination,
} from "../../../features/posts";

export default async function MyPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { status, page, size } = parseMyPostSearch(await searchParams);
  const [list, t] = await Promise.all([
    getMyPosts(locale, status, page, size),
    getTranslations({ locale, namespace: "posts" }),
  ]);
  return (
    <section className="flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("myTitle")}</h1>
        <Link href="/my-posts/new" className="text-sm underline">
          {t("newPost")}
        </Link>
      </div>
      <MyPostFilter status={status} size={size} />
      <MyPostList posts={list.posts} />
      <PostPagination links={pageLinks(list)} myPosts />
    </section>
  );
}
