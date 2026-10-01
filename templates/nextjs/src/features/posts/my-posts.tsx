import { useLocale, useTranslations } from "next-intl";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Link, getPathname } from "../../lib/i18n/navigation";
import type { MyPost, MyPostStatus } from "./model";

export function MyPostFilter({ status, size }: { status: MyPostStatus; size: number }) {
  const t = useTranslations("posts");
  const locale = useLocale();
  return (
    <form
      method="get"
      action={getPathname({ locale, href: "/my-posts" })}
      className="flex items-end gap-3"
    >
      <div className="space-y-2">
        <Label htmlFor="post-status">{t("status")}</Label>
        <select
          id="post-status"
          name="status"
          defaultValue={status}
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="all">{t("allStatuses")}</option>
          <option value="draft">{t("draft")}</option>
          <option value="published">{t("published")}</option>
        </select>
      </div>
      <input type="hidden" name="size" value={size} />
      <Button type="submit">{t("apply")}</Button>
    </form>
  );
}

export function MyPostList({ posts }: { posts: MyPost[] }) {
  const t = useTranslations("posts");
  if (!posts.length) return <p className="py-8 text-muted-foreground">{t("myEmpty")}</p>;
  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li
          key={post.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
        >
          <Link
            href={`/my-posts/${post.id}/edit`}
            className="font-medium underline underline-offset-4"
          >
            {post.title}
          </Link>
          <span className="text-sm text-muted-foreground">{t(post.status)}</span>
        </li>
      ))}
    </ul>
  );
}
