import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionApiClient } from "../api/session-client";
import { redirectOnUnauthorized } from "../session/request";

/** API 클라이언트는 no-store이며 React 캐시는 같은 요청 안에서만 쓴다. */
export const getAccount = cache(async (locale: "ko" | "en") => {
  try {
    const { data } = await (await createSessionApiClient({ locale })).GET("/me");
    return { id: data!.data.id, ...data!.data.attributes, permissions: data!.meta.permissions };
  } catch (error) {
    redirectOnUnauthorized(error, locale === "en" ? "/en" : "/");
    throw error;
  }
});

export async function requireAdmin(locale: "ko" | "en") {
  const account = await getAccount(locale);
  if (!account.permissions.includes("admin:access"))
    redirect(locale === "en" ? "/en/forbidden" : "/forbidden");
  return account;
}
