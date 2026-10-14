import { SignJWT, jwtVerify, errors } from "jose";
import { ApiError } from "../jsonapi/errors.js";
export const ACCESS_TOKEN_SECONDS = 900;
export const REFRESH_TOKEN_DAYS = 30;
export const CLOCK_SKEW_SECONDS = 30;
export function tokenError(
  code:
    | "auth.token_invalid"
    | "auth.token_expired"
    | "auth.refresh_token_reused" = "auth.token_invalid",
): ApiError {
  return new ApiError({
    status: 401,
    code,
    title: "Invalid token",
    headers: { "WWW-Authenticate": "Bearer" },
  });
}
export async function signAccessToken(
  claims: { userId: string; sessionId: string },
  secret: string,
  now = new Date(),
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_SECONDS)
    .sign(new TextEncoder().encode(secret));
}
export async function verifyAccessToken(
  token: string,
  secret: string,
  now = new Date(),
): Promise<{
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
}> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: now,
      requiredClaims: ["sub", "sid", "iat", "exp"],
    });
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.sid !== "string" ||
      !payload.sid ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > Math.floor(now.getTime() / 1000) + CLOCK_SKEW_SECONDS
    )
      throw tokenError();
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch (error) {
    throw tokenError(
      error instanceof errors.JWTExpired ? "auth.token_expired" : "auth.token_invalid",
    );
  }
}
