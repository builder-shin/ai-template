import { getTranslations } from "next-intl/server";
import { ApiError, translateApiError } from "../lib/api/errors";

export async function RequestNotice({ error, locale }: { error: unknown; locale: "ko" | "en" }) {
  if (!(error instanceof ApiError) || ![403, 404, 429].includes(error.status)) throw error;
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <section role="alert" className="space-y-3">
      <p>{translateApiError(error, locale)}</p>
      {error.status === 429 && error.retryAfter !== null && (
        <p>{t("retryAfter", { seconds: error.retryAfter })}</p>
      )}
    </section>
  );
}
