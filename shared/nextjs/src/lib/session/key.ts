import "server-only";
import { createHash } from "node:crypto";

export function deriveSessionKey(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32)
    throw new Error("SESSION_SECRET은 32바이트 이상으로 설정한다.");
  return createHash("sha256").update(secret, "utf8").digest();
}
