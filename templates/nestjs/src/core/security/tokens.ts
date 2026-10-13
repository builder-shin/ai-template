import { createHash, randomBytes } from "node:crypto";
export function newOpaqueToken(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
