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
import { loginDestination } from "../../lib/session/redirect";
import { readSession, writeSession } from "../../lib/session/request";
import type { AuthResult } from "./state";

function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
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
    const session = sessionFromTokens(document!.data.attributes, document!.data.id);
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
    target = loginDestination(returnTo, accountLocale);
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

export async function signupAction(_state: AuthResult, data: FormData): Promise<AuthResult> {
  const locale = await getLocale();
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  const name = text(data, "name");
  const email = text(data, "email");
  try {
    await client.POST("/registrations", {
      body: {
        data: {
          type: "registrations",
          attributes: { name, email, password: text(data, "password") },
        },
      },
    });
    return { ok: true, verificationEmail: email };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["name", "email", "password"]),
      name,
      email,
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
}

export async function verifyEmailAction(_state: AuthResult, data: FormData): Promise<AuthResult> {
  const locale = await getLocale();
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  try {
    await client.POST("/email-verifications", {
      body: { data: { type: "email-verifications", attributes: { token: text(data, "token") } } },
    });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    // 토큰은 편집할 입력칸이 없으므로 pointer 오류도 화면 안내로 보낸다.
    return {
      ...toFormResult(error, locale, []),
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
}

export async function requestPasswordResetAction(
  _state: AuthResult,
  data: FormData,
): Promise<AuthResult> {
  const locale = await getLocale();
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  const email = text(data, "email");
  try {
    await client.POST("/password-reset-requests", {
      body: { data: { type: "password-reset-requests", attributes: { email } } },
    });
    // 계정 존재 여부와 관계없이 같은 상태를 돌려준다.
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["email"]),
      email,
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
}

export async function resetPasswordAction(_state: AuthResult, data: FormData): Promise<AuthResult> {
  const locale = await getLocale();
  const client = createApiClient({ baseUrl: getEnv().API_BASE_URL, locale });
  try {
    await client.POST("/password-resets", {
      body: {
        data: {
          type: "password-resets",
          attributes: { token: text(data, "token"), password: text(data, "password") },
        },
      },
    });
    // 백엔드가 모든 세션을 폐기하므로 헤더도 익명 상태로 다시 렌더링한다.
    (await cookies()).set(expiredSessionCookie());
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["password"]),
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
