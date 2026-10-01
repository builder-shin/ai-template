import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "../../../lib/i18n/routing";
import { pageLinks } from "../../../lib/api/jsonapi";
import {
  getPosts,
  parsePostSearch,
  PostList,
  PostPagination,
  PostSearchForm,
  PostsRealtime,
} from "../../../features/posts";

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { q, sort, page, size } = parsePostSearch(await searchParams);
  const [list, t] = await Promise.all([
    getPosts(locale, q, sort, page, size),
    getTranslations({ locale, namespace: "posts" }),
  ]);
  return (
    <section className="flex flex-col gap-6 py-8">
      <PostsRealtime />
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <PostSearchForm q={q} sort={sort} size={size} />
      <PostList posts={list.posts} />
      <PostPagination links={pageLinks(list)} />
    </section>
  );
}
