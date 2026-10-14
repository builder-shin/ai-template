import { createHash, timingSafeEqual } from "node:crypto";
export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
export function verifiesCodeChallenge(codeChallenge: string, codeVerifier: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) return false;
  const expected = Buffer.from(challengeFor(codeVerifier));
  const received = Buffer.from(codeChallenge);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
