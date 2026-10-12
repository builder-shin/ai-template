import { createHash, randomBytes } from "node:crypto";
import { surrogatePassBytes } from "./encoding.js";
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}
export function digest(token: string): string {
  return createHash("sha256").update(surrogatePassBytes(token)).digest("hex");
}
