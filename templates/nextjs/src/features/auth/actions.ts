"use server";

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createApiClient } from "../../lib/api/client";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError, toFormResult } from "../../lib/api/errors";
import { getEnv } from "../../lib/env";
import { expiredSessionCookie, sessionFromTokens } from "../../lib/session/cookie";
import { safeReturnTo } from "../../lib/session/redirect";
import { readSession, writeSession } from "../../lib/session/request";
import type { AuthResult } from "./state";

function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

function destination(returnTo: string, locale: "ko" | "en") {
  const path = safeReturnTo(returnTo).replace(/^\/(ko|en)(?=\/|[?#]|$)/, "") || "/";
  const relative = safeReturnTo(path.startsWith("/") ? path : `/${path}`);
  return locale === "ko" ? relative : `/en${relative.replace(/^\/(?=[?#]|$)/, "")}`;
}

export async function loginAction(
  returnTo: string,
  _state: AuthResult,
  data: FormData,
): Promise<AuthResult> {
  const locale = await getLocale();
  const email = text(data, "email");
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  let target: string;
  try {
    const { data: document } = await client.POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: {
            grantType: "password",
            email,
            password: text(data, "password"),
          },
        },
      },
    });
    const session = sessionFromTokens(document!.data.attributes);
    // 세션 응답에는 계정 로케일이 없으므로 발급된 토큰으로 본인을 읽는다.
    const authenticated = createApiClient({
      baseUrl: getEnv().API_BASE_URL,
      locale,
      accessToken: session.accessToken,
    });
    const { data: me } = await authenticated.GET("/me");
    const accountLocale = me!.data.attributes.locale;
    await writeSession(session);
    (await cookies()).set({
      name: "NEXT_LOCALE",
      value: accountLocale,
      path: "/",
      sameSite: "lax",
    });
    target = destination(returnTo, accountLocale);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["email", "password"]),
      email,
      ...(error.code === "auth.email_not_verified" ? { verificationEmail: email } : {}),
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
  redirect(target);
}

export async function resendVerificationAction(
  _state: AuthResult,
  data: FormData,
): Promise<AuthResult> {
  const locale = await getLocale();
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  const email = text(data, "email");
  try {
    await client.POST("/email-verification-requests", {
      body: { data: { type: "email-verification-requests", attributes: { email } } },
    });
    return { ok: true, verificationEmail: email };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["email"]),
      verificationEmail: email,
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
}

export async function logoutAction(): Promise<void> {
  const locale = await getLocale();
  try {
    if (await readSession()) {
      const client = await createSessionApiClient({ locale });
      await client.DELETE("/sessions/current");
    }
  } catch {
    // API 실패여도 이 브라우저의 세션을 끝낸다.
  } finally {
    (await cookies()).set(expiredSessionCookie());
  }
  redirect(locale === "en" ? "/en" : "/");
}
