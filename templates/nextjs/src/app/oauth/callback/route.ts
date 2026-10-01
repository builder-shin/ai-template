import { NextRequest, NextResponse } from "next/server";
import { createApiClient } from "../../../lib/api/client";
import { ApiError } from "../../../lib/api/errors";
import { getEnv } from "../../../lib/env";
import { sessionCookie, sessionFromTokens } from "../../../lib/session/cookie";
import {
  expiredOAuthCookie,
  oauthCookieOptions,
  unsealOAuthAttempt,
} from "../../../lib/session/oauth";
import { loginDestination, loginPath } from "../../../lib/session/redirect";

export async function GET(request: NextRequest) {
  const env = getEnv();
  const attempt = await unsealOAuthAttempt(request.cookies.get(oauthCookieOptions().name)?.value);
  const locale =
    attempt?.locale ?? (request.cookies.get("NEXT_LOCALE")?.value === "en" ? "en" : "ko");
  const query = request.nextUrl.searchParams;
  const complete = (response: NextResponse) => {
    response.cookies.set(expiredOAuthCookie());
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const failed = (notice = "auth.oauth_failed") => {
    const login = new URL(loginPath(attempt?.returnTo ?? "/", locale), env.APP_URL);
    login.searchParams.set("notice", notice);
    return complete(NextResponse.redirect(login, 303));
  };
  // 제공자 리다이렉트는 cross-site GET이다. 쿠키와 PKCE가 시작한 브라우저를 확인한다.
  if (
    !attempt ||
    query.getAll("provider").length > 1 ||
    (query.has("provider") && query.get("provider") !== attempt.provider)
  )
    return failed();
  if (query.has("error"))
    return failed(
      query.get("error") === "auth.oauth_denied" ? "auth.oauth_denied" : "auth.oauth_failed",
    );
  const code = query.get("code");
  if (!code || query.getAll("code").length !== 1) return failed();
  try {
    const client = createApiClient({ baseUrl: env.API_BASE_URL, locale });
    const { data } = await client.POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "oauthCode", code, codeVerifier: attempt.verifier },
        },
      },
    });
    const session = sessionFromTokens(data!.data.attributes);
    const authenticated = createApiClient({
      baseUrl: env.API_BASE_URL,
      locale,
      accessToken: session.accessToken,
    });
    const { data: me } = await authenticated.GET("/me");
    const accountLocale = me!.data.attributes.locale;
    const response = NextResponse.redirect(
      new URL(loginDestination(attempt.returnTo, accountLocale), env.APP_URL),
      303,
    );
    response.cookies.set(await sessionCookie(session));
    response.cookies.set({ name: "NEXT_LOCALE", value: accountLocale, path: "/", sameSite: "lax" });
    return complete(response);
  } catch (error) {
    if (!(error instanceof ApiError))
      console.error(
        `OAuth 콜백 처리 실패: ${error instanceof Error ? error.name : "UnknownError"}`,
      );
    return failed();
  }
}
