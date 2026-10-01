import { NextRequest, NextResponse } from "next/server";
import { expiredSessionCookie } from "../../../lib/session/cookie";
import { loginPath, safeReturnTo } from "../../../lib/session/redirect";

export function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const response = NextResponse.redirect(new URL(loginPath(returnTo), request.url), 303);
  response.cookies.set(expiredSessionCookie());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
