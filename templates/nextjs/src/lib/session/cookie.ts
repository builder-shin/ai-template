import "server-only";
import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { z } from "zod";
import { getEnv } from "../env";
import type { components } from "../api/schema";

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.iso.datetime({ offset: true }),
  refreshTokenExpiresAt: z.iso.datetime({ offset: true }),
});
export type Session = z.infer<typeof sessionSchema>;

/** 토큰은 불투명하다. 만료 시각은 계약 응답에서만 가져온다. */
export function sessionFromTokens(
  tokens: components["schemas"]["SessionWithTokensAttributes"],
): Session {
  return sessionSchema.parse(tokens);
}

function key(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32)
    throw new Error("SESSION_SECRET은 32바이트 이상으로 설정한다.");
  return createHash("sha256").update(secret, "utf8").digest();
}

export async function sealSession(session: Session, secret = getEnv().SESSION_SECRET) {
  const data = sessionSchema.parse(session);
  return new EncryptJWT(data)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime(Math.floor(Date.parse(data.refreshTokenExpiresAt) / 1000))
    .encrypt(key(secret));
}

export async function unsealSession(
  value: string | undefined,
  secret?: string,
): Promise<Session | null> {
  if (!value) return null;
  const encryptionKey = key(secret ?? getEnv().SESSION_SECRET);
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
