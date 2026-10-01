import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { getEnv } from "../env";
import type { components } from "../api/schema";
import { deriveSessionKey } from "./key";

const sessionSchema = z.object({
  sessionId: z.string().min(1).optional(),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime({ offset: true }),
  refreshTokenExpiresAt: z.iso.datetime({ offset: true }),
});
export type Session = z.infer<typeof sessionSchema>;

/** 식별자와 만료 시각은 계약 응답에서 가져온다. 토큰은 불투명하다. */
export function sessionFromTokens(
  tokens: components["schemas"]["SessionWithTokensAttributes"],
  sessionId: string,
): Session {
  return sessionSchema.parse({ ...tokens, sessionId: z.string().min(1).parse(sessionId) });
}

export async function sealSession(session: Session, secret = getEnv().SESSION_SECRET) {
  const data = sessionSchema.parse(session);
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime(Math.floor(Date.parse(data.refreshTokenExpiresAt) / 1000))
    .encrypt(deriveSessionKey(secret));
}

export async function unsealSession(
  value: string | undefined,
  secret?: string,
): Promise<Session | null> {
  if (!value) return null;
  const encryptionKey = deriveSessionKey(secret ?? getEnv().SESSION_SECRET);
  try {
    const { payload } = await jwtDecrypt(value, encryptionKey, {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      requiredClaims: ["exp"],
    });
    const result = sessionSchema.safeParse(payload);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function sessionCookieName(mode = process.env.NODE_ENV) {
  return mode === "production" ? "__Host-session" : "session";
}

export function sessionCookieOptions(mode = process.env.NODE_ENV) {
  return {
    name: sessionCookieName(mode),
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: mode === "production",
  };
}

export async function sessionCookie(
  session: Session,
  secret?: string,
  mode = process.env.NODE_ENV,
) {
  return {
    ...sessionCookieOptions(mode),
    value: await sealSession(session, secret),
    expires: new Date(session.refreshTokenExpiresAt),
  };
}

export function expiredSessionCookie() {
  return { ...sessionCookieOptions(), value: "", maxAge: 0, expires: new Date(0) };
}
