import "server-only";
import { cache } from "react";
import { createSessionApiClient } from "../api/session-client";
import type { routing } from "../i18n/routing";
import { readSession, redirectOnUnauthorized } from "./request";

/** 쿠키에는 이름이 없으므로 서버에서 읽고 UI에는 이름만 전달한다. */
export const getHeaderUser = cache(async (locale: (typeof routing.locales)[number]) => {
  if (!(await readSession())) return null;
  const client = await createSessionApiClient({ locale });
  try {
    const { data } = await client.GET("/me");
    return { name: data!.data.attributes.name };
  } catch (error) {
    redirectOnUnauthorized(error, locale === "en" ? "/en" : "/");
    throw error;
  }
});
