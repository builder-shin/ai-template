"use server";
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createApiClient } from "../api/client";
import { createSessionApiClient } from "../api/session-client";
import { ApiError, toFormResult } from "../api/errors";
import { getEnv } from "../env";
import { expiredSessionCookie, sessionFromTokens } from "../session/cookie";
import { readSession, writeSession, redirectOnUnauthorized } from "../session/request";
import { loginDestination } from "../session/redirect";
import { safeLoginReturnTo } from "./redirect";
import ko from "../../../messages/ko.json";
import en from "../../../messages/en.json";
import type { LoginState, LocaleState } from "./state";

function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function loginAction(
  returnTo: string,
  _state: LoginState,
  data: FormData,
): Promise<LoginState> {
  const locale = await getLocale();
  const email = text(data, "email");
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  let target: string;
  let issued: ReturnType<typeof createApiClient> | undefined;
  try {
    const { data: document } = await client.POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email, password: text(data, "password") },
        },
      },
    });
    const session = sessionFromTokens(document!.data.attributes, document!.data.id);
    issued = createApiClient({
      baseUrl: getEnv().API_BASE_URL,
      locale,
      accessToken: session.accessToken,
    });
    const { data: me } = await issued.GET("/me");
    if (!me!.meta.permissions.includes("admin:access")) {
      await issued.DELETE("/sessions/current");
      issued = undefined;
      return {
        ok: false,
        noAccess: true,
        email,
        formError: (locale === "en" ? en : ko).auth.noAccess,
        fieldErrors: {},
      };
    }
    const accountLocale = me!.data.attributes.locale;
    await writeSession(session);
    (await cookies()).set({
      name: "NEXT_LOCALE",
      value: accountLocale,
      path: "/",
      sameSite: "lax",
    });
    target = loginDestination(safeLoginReturnTo(returnTo), accountLocale);
    issued = undefined;
  } catch (error) {
    // 권한 확인에 실패한 발급 세션도 브라우저에 남기지 않는다.
    if (issued) await issued.DELETE("/sessions/current").catch(() => {});
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["email", "password"]),
      email,
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const locale = await getLocale();
  try {
    if (await readSession())
      await (await createSessionApiClient({ locale })).DELETE("/sessions/current");
  } catch {
    /* API 실패에도 이 브라우저의 세션은 끝낸다. */
  } finally {
    (await cookies()).set(expiredSessionCookie());
  }
  redirect(locale === "en" ? "/en/login" : "/login");
}

export async function changeLocaleAction(
  locale: "ko" | "en",
  returnTo: string,
  _state: LocaleState = { ok: true },
): Promise<LocaleState> {
  if (locale !== "ko" && locale !== "en")
    throw new Error("locale: 지원하지 않는 언어다 — ko 또는 en을 고른다.");
  const client = await createSessionApiClient({ locale });
  try {
    const { data: me } = await client.GET("/me");
    await client.PATCH("/me", {
      body: { data: { type: "users", id: me!.data.id, attributes: { locale } } },
    });
  } catch (error) {
    redirectOnUnauthorized(error, returnTo);
    if (error instanceof ApiError && error.status >= 400 && error.status < 500)
      return {
        ...toFormResult(error, await getLocale(), []),
        ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
      };
    throw error;
  }
  (await cookies()).set({ name: "NEXT_LOCALE", value: locale, path: "/", sameSite: "lax" });
  revalidatePath("/[locale]", "layout");
  redirect(loginDestination(returnTo, locale));
}
