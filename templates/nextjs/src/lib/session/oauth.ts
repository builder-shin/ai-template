import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { getEnv } from "../env";
import { deriveSessionKey } from "./key";
import { safeReturnTo } from "./redirect";

export const oauthProviders = ["google", "kakao", "naver"] as const;
const attemptSchema = z.object({
  provider: z.enum(oauthProviders),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  returnTo: z.string().transform(safeReturnTo),
  locale: z.enum(["ko", "en"]),
});
export type OAuthAttempt = z.input<typeof attemptSchema>;

export function oauthCookieOptions(mode = process.env.NODE_ENV) {
  return {
    name: mode === "production" ? "__Host-oauth" : "oauth",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: mode === "production",
  };
}

/** 시도마다 verifier를 바꾼다. sub로 세션 JWE와 구분한다. */
export async function oauthCookie(
  attempt: OAuthAttempt,
  secret = getEnv().SESSION_SECRET,
  mode = process.env.NODE_ENV,
) {
  const value = await new EncryptJWT(attemptSchema.parse(attempt))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setSubject("oauth")
    .setIssuedAt()
    .setExpirationTime("10m")
    .encrypt(deriveSessionKey(secret));
  return { ...oauthCookieOptions(mode), value, maxAge: 600 };
}

export async function unsealOAuthAttempt(
  value: string | undefined,
  secret?: string,
): Promise<OAuthAttempt | null> {
  if (!value) return null;
  const encryptionKey = deriveSessionKey(secret ?? getEnv().SESSION_SECRET);
  try {
    const { payload } = await jwtDecrypt(value, encryptionKey, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      requiredClaims: ["exp", "sub"],
      subject: "oauth",
    });
    const parsed = attemptSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function expiredOAuthCookie() {
  return { ...oauthCookieOptions(), value: "", maxAge: 0, expires: new Date(0) };
}
