import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "../api/errors";
import {
  expiredSessionCookie,
  sessionCookie,
  sessionCookieName,
  unsealSession,
  type Session,
} from "./cookie";
import { loginPath, safeReturnTo } from "./redirect";

/** Server Component와 Action은 읽기만 한다. 갱신은 proxy의 책임이다. */
export async function readSession() {
  return unsealSession((await cookies()).get(sessionCookieName())?.value);
}

/** 로그인·로그아웃 등 쿠키를 쓸 수 있는 Action/route에서 호출한다. */
export async function writeSession(session: Session) {
  (await cookies()).set(await sessionCookie(session));
}

export async function clearSessionAndRedirect(returnTo = "/"): Promise<never> {
  (await cookies()).set(expiredSessionCookie());
  redirect(loginPath(returnTo));
}

/** 렌더링에서는 쿠키를 지울 수 없어 정리 route의 GET 응답에서 지운다. */
export function redirectOnUnauthorized(error: unknown, returnTo = "/") {
  if (error instanceof ApiError && error.status === 401) {
    redirect(`/session/clear?${new URLSearchParams({ returnTo: safeReturnTo(returnTo) })}`);
  }
}
