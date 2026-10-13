import { createHmac } from "node:crypto";
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function hashIdentifier(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");
}
