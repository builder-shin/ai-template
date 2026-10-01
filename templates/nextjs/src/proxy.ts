import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./lib/i18n/routing";
import {
  expiredSessionCookie,
  sessionCookie,
  sessionCookieName,
  unsealSession,
} from "./lib/session/cookie";
import { loginPath, requiresLogin } from "./lib/session/redirect";
import { refreshSession } from "./lib/session/refresh";

const intl = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  let response = intl(request);
  const locale =
    response.headers.get("x-middleware-request-x-next-intl-locale") === "en" ||
    /^\/en(?:\/|$)/.test(new URL(response.headers.get("location") ?? request.url).pathname)
      ? "en"
      : "ko";
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const cookie = request.cookies.get(sessionCookieName())?.value;
  const session = await unsealSession(cookie);
  const toLogin = () =>
    NextResponse.redirect(new URL(loginPath(returnTo, locale), request.url), 303);

  if (!session) {
    if (requiresLogin(request.nextUrl.pathname)) response = toLogin();
    if (cookie) response.cookies.set(expiredSessionCookie());
    return response;
  }
  if (Date.parse(session.accessTokenExpiresAt) - Date.now() >= 60000) return response;

  try {
    const renewed = await refreshSession(session.refreshToken, locale);
    const nextCookie = await sessionCookie(renewed);
    request.cookies.set(nextCookie.name, nextCookie.value);
    // next-intl이 만든 로케일 헤더와 rewrite를 보존하며 요청 쿠키만 교체한다.
    const headers = new Headers(request.headers);
    for (const name of response.headers.get("x-middleware-override-headers")?.split(",") ?? []) {
      const value = response.headers.get(`x-middleware-request-${name}`);
      if (name !== "cookie") {
        if (value === null) headers.delete(name);
        else headers.set(name, value);
      }
    }
    const overrides = NextResponse.next({ request: { headers } });
    overrides.headers.forEach((value, name) => {
      if (name === "x-middleware-override-headers" || name.startsWith("x-middleware-request-"))
        response.headers.set(name, value);
    });
    response.cookies.set(nextCookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    response = toLogin();
    response.cookies.set(expiredSessionCookie());
    return response;
  }
}

export const config = {
  // 점이 있는 보호 경로도 검사한다. 공개 정적 파일은 이름으로 제외한다.
  matcher: [
    "/((?!api|_next|_vercel|session/clear|icon\\.svg|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
