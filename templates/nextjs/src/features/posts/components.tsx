import Image from "next/image";
import { useLocale, useFormatter, useTranslations } from "next-intl";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, getPathname } from "../../lib/i18n/navigation";
import type { routing } from "../../lib/i18n/routing";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Skeleton } from "../../components/ui/skeleton";
import { postPageHref, myPostPageHref, type Post, type PostSort } from "./model";

function PostCover({ post }: { post: Post }) {
  const t = useTranslations("posts");
  // presigned URL은 짧게 유효하므로 최적화 캐시를 거치지 않는다.
  return post.coverUrl ? (
    <Image
      src={post.coverUrl}
      alt={t("coverAlt", { title: post.title })}
      width={960}
      height={540}
      unoptimized
      className="aspect-video w-full rounded-lg object-cover"
    />
  ) : null;
}

function PostByline({ post }: { post: Post }) {
  const t = useTranslations("posts");
  const format = useFormatter();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{post.authorName || t("unknownAuthor")}</span>
      {post.publishedAt && (
        <time dateTime={post.publishedAt}>
          {format.dateTime(new Date(post.publishedAt), {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </time>
      )}
    </div>
  );
}

export function PostList({ posts }: { posts: Post[] }) {
  const t = useTranslations("posts");
  if (!posts.length) return <p className="py-8 text-muted-foreground">{t("empty")}</p>;
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {posts.map((post) => (
        <li key={post.id} className="flex flex-col gap-3 rounded-lg border p-4">
          <PostCover post={post} />
          <h2 className="text-xl font-semibold">
            <Link
              href={`/posts/${post.id}`}
              className="rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {post.title}
            </Link>
          </h2>
          <PostByline post={post} />
        </li>
      ))}
    </ul>
  );
}

export function PostSearchForm({ q, sort, size }: { q: string; sort: PostSort; size: number }) {
  const t = useTranslations("posts");
  const locale = useLocale() as (typeof routing.locales)[number];
  return (
    <form
      action={getPathname({ locale, href: "/posts" })}
      method="get"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex min-w-48 flex-1 flex-col gap-2">
        <Label htmlFor="post-search">{t("search")}</Label>
        <Input id="post-search" type="search" name="q" defaultValue={q} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="post-sort">{t("sort")}</Label>
        {/* 네이티브 select는 JS 없이 GET 폼의 값을 보낸다. */}
        <select
          id="post-sort"
          name="sort"
          defaultValue={sort}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="latest">{t("sortLatest")}</option>
          <option value="published">{t("sortPublished")}</option>
          <option value="title">{t("sortTitle")}</option>
        </select>
      </div>
      <input type="hidden" name="size" value={size} />
      <Button type="submit">{t("apply")}</Button>
    </form>
  );
}

export function PostPagination({
  links,
  myPosts = false,
}: {
  links: { previous: string | null; next: string | null };
  myPosts?: boolean;
}) {
  const t = useTranslations("posts");
  const href = myPosts ? myPostPageHref : postPageHref;
  if (!links.previous && !links.next) return null;
  return (
    <nav aria-label={t("pagination")} className="flex justify-between gap-4">
      {links.previous ? (
        <Link
          href={href(links.previous)}
          className="rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      {links.next && (
        <Link
          href={href(links.next)}
          className="rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("next")}
        </Link>
      )}
    </nav>
  );
}

export function PostDetail({ post }: { post: Post }) {
  const t = useTranslations("posts");
  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <Link
        href="/posts"
        className="rounded-md text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("back")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
      <PostByline post={post} />
      <PostCover post={post} />
      <div className="break-words leading-relaxed [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg [&_li]:ml-6 [&_ol]:list-decimal [&_p]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:px-3 [&_th]:border [&_th]:px-3 [&_ul]:list-disc">
        <Markdown skipHtml remarkPlugins={[remarkGfm]}>
          {post.body}
        </Markdown>
      </div>
    </article>
  );
}

export function PostsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6 py-8">
      <Skeleton className="h-9 w-32" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-6 sm:grid-cols-2">
        {[0, 1, 2, 3].map((id) => (
          <Skeleton key={id} className="h-48 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PostDetailSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
