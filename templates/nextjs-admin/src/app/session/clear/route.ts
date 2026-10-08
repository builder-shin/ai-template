import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "../../../lib/env";
import { expiredSessionCookie } from "../../../lib/session/cookie";
import { loginPath, safeReturnTo } from "../../../lib/session/redirect";

export function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const appOrigin = new URL(getEnv().APP_URL).origin;
  // 이동 GET에는 Origin이 없을 수 있다. 그때는 브라우저의 같은 origin 표식을 요구한다.
  if (
    (site && site !== "same-origin") ||
    (origin ? origin !== appOrigin : site !== "same-origin")
  ) {
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const response = NextResponse.redirect(new URL(loginPath(returnTo), request.url), 303);
  response.cookies.set(expiredSessionCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
