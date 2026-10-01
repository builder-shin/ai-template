"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createSessionApiClient } from "../../lib/api/session-client";
import { ApiError, toFormResult } from "../../lib/api/errors";
import type { components } from "../../lib/api/schema";
import { getPathname } from "../../lib/i18n/navigation";
import { redirectOnUnauthorized } from "../../lib/session/request";
import type { ProfileResult, ProfileValues, PasswordResult } from "./state";

function text(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateProfileAction(
  _state: ProfileResult,
  data: FormData,
): Promise<ProfileResult> {
  const locale = await getLocale();
  const input: ProfileValues = {
    name: text(data, "name"),
    locale: text(data, "locale"),
    ...(data.has("avatar") ? { avatar: text(data, "avatar") } : {}),
  };
  const client = await createSessionApiClient({ locale });
  let accountLocale: "ko" | "en";
  try {
    // id는 클라이언트 입력을 믿지 않고 현재 세션의 본인 응답에서 읽는다.
    const { data: me } = await client.GET("/me");
    const { data: updated } = await client.PATCH("/me", {
      body: {
        data: {
          type: "users",
          id: me!.data.id,
          attributes: {
            name: input.name,
            // 형식 검증의 원본은 백엔드다. 잘못된 값도 pointer 오류로 돌려준다.
            locale: input.locale as components["schemas"]["Locale"],
          },
          ...(input.avatar !== undefined
            ? {
                relationships: {
                  avatar: { data: input.avatar ? { type: "files", id: input.avatar } : null },
                },
              }
            : {}),
        },
      },
    });
    accountLocale = updated!.data.attributes.locale;
  } catch (error) {
    redirectOnUnauthorized(error, getPathname({ locale, href: "/me" }));
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["name", "locale"]),
      values: input,
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
  // 헤더와 공개 글 작성자 이름도 현재 정보로 다시 렌더링한다.
  revalidatePath("/[locale]", "layout");
  (await cookies()).set({ name: "NEXT_LOCALE", value: accountLocale, path: "/", sameSite: "lax" });
  if (accountLocale !== locale) redirect(getPathname({ locale: accountLocale, href: "/me" }));
  return { ok: true, saved: true };
}

export async function changePasswordAction(
  _state: PasswordResult,
  data: FormData,
): Promise<PasswordResult> {
  const locale = await getLocale();
  const client = await createSessionApiClient({ locale });
  try {
    await client.POST("/password-changes", {
      body: {
        data: {
          type: "password-changes",
          attributes: {
            currentPassword: text(data, "currentPassword"),
            newPassword: text(data, "newPassword"),
          },
        },
      },
    });
    // 백엔드는 다른 세션만 폐기한다. 현재 쿠키와 두 토큰을 유지한다.
    return { ok: true, changed: true };
  } catch (error) {
    const wrongPassword =
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === "auth.invalid_credentials" &&
      error.pointer === "/data/attributes/currentPassword";
    if (!wrongPassword) redirectOnUnauthorized(error, getPathname({ locale, href: "/me" }));
    if (!(error instanceof ApiError) || error.status < 400 || error.status >= 500) throw error;
    return {
      ...toFormResult(error, locale, ["currentPassword", "newPassword"]),
      ...(error.status === 429 ? { retryAfter: error.retryAfter } : {}),
    };
  }
}
