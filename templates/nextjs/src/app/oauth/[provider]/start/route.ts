import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "../../../../lib/env";
import { oauthCookie, oauthProviders } from "../../../../lib/session/oauth";
import { safeReturnTo } from "../../../../lib/session/redirect";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const env = getEnv();
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  // 클릭으로 시작한 같은 Origin 이동만 쿠키를 만든다.
  if (
    (site && site !== "same-origin") ||
    (origin ? origin !== new URL(env.APP_URL).origin : site !== "same-origin")
  )
    return new NextResponse(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  const { provider } = await context.params;
  const selected = oauthProviders.find((value) => value === provider);
  if (!selected)
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const queryLocale = request.nextUrl.searchParams.get("locale");
  const locale =
    queryLocale === "ko" || queryLocale === "en"
      ? queryLocale
      : request.cookies.get("NEXT_LOCALE")?.value === "en" ||
          /^en\b/i.test(request.headers.get("accept-language") ?? "")
        ? "en"
        : "ko";
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${env.API_BASE_URL.replace(/\/$/, "")}/oauth/${selected}/authorize`);
  authorize.searchParams.set("redirectUri", new URL("/oauth/callback", env.APP_URL).href);
  authorize.searchParams.set(
    "codeChallenge",
    createHash("sha256").update(verifier).digest("base64url"),
  );
  const response = NextResponse.redirect(authorize, 303);
  response.cookies.set(
    await oauthCookie({
      provider: selected,
      verifier,
      returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
      locale,
    }),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
