"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError, toFormResult } from "../../lib/api/errors";
import { getPathname } from "../../lib/i18n/navigation";
import { clearSessionAndRedirect, redirectOnUnauthorized } from "../../lib/session/request";
import type { SessionsResult } from "./state";

function failure(error: unknown, locale: "ko" | "en"): SessionsResult {
  redirectOnUnauthorized(error, getPathname({ locale, href: "/me/sessions" }));
  if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
  return {
    ...toFormResult(error, locale, []),
    ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
  };
}

export async function revokeSessionAction(
  id: string,
  _state: SessionsResult,
  _data: FormData,
): Promise<SessionsResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    await client.DELETE("/sessions/{id}", { params: { path: { id } } });
  } catch (error) {
    return failure(error, locale);
  }
  revalidatePath("/[locale]/me/sessions", "page");
  // 클라이언트의 current 값을 믿지 않고 폐기 뒤 현재 토큰으로 본인을 확인한다.
  try {
    await client.GET("/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await clearSessionAndRedirect(getPathname({ locale, href: "/me/sessions" }));
    }
    return failure(error, locale);
  }
  return { ok: true, revokedCount: 1 };
}

export async function revokeListedSessionAction(
  sessionIds: string[],
  state: SessionsResult,
  data: FormData,
): Promise<SessionsResult> {
  // id는 서버에서 바인딩하고 폼은 그 목록의 순번만 선택한다.
  const index = data.get("sessionIndex");
  const id =
    typeof index === "string" && /^\d+$/.test(index) ? sessionIds[Number(index)] : undefined;
  if (!id) {
    const locale = await getLocale();
    const t = await getTranslations({ locale, namespace: "errors" });
    return { ok: false, formError: t("resource.not_found"), fieldErrors: {} };
  }
  return revokeSessionAction(id, state, data);
}

export async function revokeOthersAction(
  _state: SessionsResult,
  _data: FormData,
): Promise<SessionsResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    const { data } = await client.POST("/session-revocations", {
      body: { data: { type: "session-revocations", attributes: { scope: "others" } } },
    });
    revalidatePath("/[locale]/me/sessions", "page");
    return { ok: true, revokedCount: data!.data.attributes.revokedCount };
  } catch (error) {
    return failure(error, locale);
  }
}

export async function revokeAllAction(
  _state: SessionsResult,
  data: FormData,
): Promise<SessionsResult> {
  const locale = await getLocale();
  if (data.get("confirm") !== "on") {
    const t = await getTranslations({ locale, namespace: "sessions" });
    return { ok: false, formError: t("confirmRequired"), fieldErrors: {} };
  }
  const client = await createSessionApiClient({ locale });
  try {
    await client.POST("/session-revocations", {
      body: { data: { type: "session-revocations", attributes: { scope: "all" } } },
    });
  } catch (error) {
    return failure(error, locale);
  }
  return clearSessionAndRedirect(getPathname({ locale, href: "/me/sessions" }));
}
