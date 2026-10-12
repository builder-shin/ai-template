import { createHmac } from "node:crypto";
import { surrogatePassBytes } from "./encoding.js";
export function identifierHash(email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(surrogatePassBytes(email.trim().toLowerCase()))
    .digest("hex");
}
