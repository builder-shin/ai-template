import "server-only";
import { cache } from "react";
import { createSessionApiClient } from "../../lib/api/session-client";
import { getPathname } from "../../lib/i18n/navigation";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { SessionsPage } from "./state";

/** API의 페이지 번호만 web 링크로 옮긴다. API 주소는 화면에 전달하지 않는다. */
function pageHref(link: string | null | undefined) {
  if (!link) return null;
  const page = new URL(link, "http://localhost").searchParams.get("page[number]") ?? "1";
  return `/me/sessions?${new URLSearchParams({ page })}`;
}

export const getSessions = cache(async (locale: "ko" | "en", page = 1): Promise<SessionsPage> => {
  const client = await createSessionApiClient({ locale });
  try {
    const { data: document } = await client.GET("/sessions", {
      params: { query: { "page[number]": page, "page[size]": 10, sort: "-lastUsedAt" } },
    });
    return {
      // 토큰과 사용자 관계를 클라이언트 컴포넌트로 보내지 않는다.
      items: document!.data.map(({ id, attributes }) => ({
        id,
        current: attributes.current,
        userAgent: attributes.userAgent,
        createdAt: attributes.createdAt,
        lastUsedAt: attributes.lastUsedAt,
      })),
      previous: pageHref(document!.links.prev),
      next: pageHref(document!.links.next),
    };
  } catch (error) {
    redirectOnUnauthorized(error, getPathname({ locale, href: "/me/sessions" }));
    throw error;
  }
});
