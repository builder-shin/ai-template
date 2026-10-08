import { useTranslations } from "next-intl";
import { Link } from "../../lib/i18n/navigation";
import { buttonVariants } from "../ui/button";
import { resourceUrl, type Query } from "./url";
export function ResourcePagination({
  type,
  query,
  page,
}: {
  type: string;
  query: Query;
  page: { number: number; totalPages: number; total: number };
}) {
  const t = useTranslations("resource");
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4">
      {page.number > 1 ? (
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={resourceUrl(type, query, { "page[number]": String(page.number - 1) })}
        >
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <p>
        {t("page", {
          number: page.number,
          totalPages: Math.max(1, page.totalPages),
          total: page.total,
        })}
      </p>
      {page.number < page.totalPages ? (
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={resourceUrl(type, query, { "page[number]": String(page.number + 1) })}
        >
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
