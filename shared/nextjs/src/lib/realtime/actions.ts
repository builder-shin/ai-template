"use server";

import "server-only";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { createSessionApiClient } from "../api/session-client";
import { ApiError } from "../api/errors";
import { expiredSessionCookie } from "../session/cookie";
import { readSession } from "../session/request";

/** 연결마다 쓰는 1회용 티켓만 브라우저에 전달한다. */
export async function getRealtimeTicket(): Promise<string | null> {
  if (!(await readSession())) return null;
  const client = await createSessionApiClient({ locale: await getLocale() });
  try {
    const { data } = await client.POST("/realtime-tickets", {
      body: { data: { type: "realtime-tickets", attributes: {} } },
    });
    return data!.data.attributes.token;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    (await cookies()).set(expiredSessionCookie());
    return null;
  }
}

/** 이벤트는 사용자 룸 전체에 오므로 현재 세션이 끝났는지 서버에서 확인한다. */
export async function checkRealtimeSession(): Promise<"active" | "revoked" | "unavailable"> {
  try {
    if (await readSession()) {
      const client = await createSessionApiClient({ locale: await getLocale() });
      await client.GET("/me");
      return "active";
    }
  } catch (error) {
    // 연결 오류·5xx는 세션 폐기의 근거가 아니다. 다음 이벤트나 HTTP 요청에 맡긴다.
    if (!(error instanceof ApiError) || error.status !== 401) return "unavailable";
  }
  (await cookies()).set(expiredSessionCookie());
  return "revoked";
}
