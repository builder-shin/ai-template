import { SignJWT, jwtVerify, errors } from "jose";
import { ApiError } from "../jsonapi/errors.js";
export interface AccessClaims {
  userId: string;
  sessionId: string;
}
export async function signAccessToken(
  secret: string,
  userId: string,
  sessionId: string,
  now = new Date(),
) {
  const iat = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((iat + 900) * 1000);
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 900)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}
export async function verifyAccessToken(
  secret: string,
  token: string,
  currentDate = new Date(),
): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "sid", "iat", "exp"],
      clockTolerance: 30,
      currentDate,
    });
    if (
      typeof payload.iat !== "number" ||
      payload.iat > Math.floor(currentDate.getTime() / 1000) + 30
    )
      throw new Error("Access token iat exceeds clock tolerance.");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      !uuid.test(payload.sub) ||
      !uuid.test(payload.sid)
    )
      throw new Error("Invalid UUID claims.");
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    throw new ApiError(
      401,
      error instanceof errors.JWTExpired ? "auth.token_expired" : "auth.token_invalid",
    );
  }
}
