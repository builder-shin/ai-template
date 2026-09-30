/**
 * 비밀번호, 무작위 토큰, 식별자 해시. 도메인을 모르는 암호 도구다(FastAPI의 core/security.py).
 *
 * - 비밀번호는 가벼운 scrypt로 해시한다. 운영용이 아니다(FastAPI는 Argon2id). 해시가 없는 계정(없는
 *   계정, 소셜 전용)도 가짜 해시를 검증해 FastAPI와 같은 흐름을 탄다.
 * - 토큰(access, refresh, 1회용)은 32바이트 무작위 값을 base64url로 쓴 43자다. 저장할 때는 원문 대신
 *   SHA-256(digest)을 키로 쓴다.
 * - 이메일 같은 식별자는 설정 키(IDENTIFIER_HASH_SECRET)의 HMAC-SHA256으로 가린다. FastAPI와 같은
 *   함수라 같은 키면 레이트 리밋 키와 감사 로그의 identifierHash가 FastAPI와 같다.
 * - PKCE(S256) challenge는 소셜 로그인의 백엔드(auth)와 가짜 OAuth 서버가 함께 쓴다.
 */

import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 1024;
const SCRYPT_KEY_LENGTH = 32;
const SCHEME = "scrypt";

function derive(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_COST });
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${SCHEME}$${salt.toString("base64url")}$${derive(password, salt).toString("base64url")}`;
}

let dummyHash: string | undefined;

/**
 * 비밀번호가 해시와 맞는가. 해시가 없으면(계정이 없거나 소셜 전용) 늘 false다. 해시가 없어도 가짜
 * 해시를 검증한다(FastAPI가 응답 시간으로 계정이 있는지 드러내지 않으려고 하는 일과 같다).
 */
export function checkPassword(password: string, hashed: string | null): boolean {
  if (hashed === null) {
    dummyHash ??= hashPassword(newToken());
    checkPassword(password, dummyHash);
    return false;
  }
  const [scheme, salt, expected] = hashed.split("$");
  if (scheme !== SCHEME || salt === undefined || expected === undefined) return false;
  const actual = derive(password, Buffer.from(salt, "base64url"));
  const wanted = Buffer.from(expected, "base64url");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

/** refresh token, access token, 1회용 토큰의 값. 32바이트 무작위 값을 base64url로 쓴 43자다. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 16진수. 무작위 토큰을 원문 대신 저장할 때 키로 쓴다. */
export function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** PKCE S256 challenge(RFC 7636): code verifier의 SHA-256을 패딩 없는 base64url로 쓴 43자. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

/** 식별자(정규화한 이메일)의 HMAC-SHA256 16진수. 레이트 리밋 키와 감사 로그에 원문 대신 쓴다. */
export function identifierHash(value: string, key: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}
