import { hash, verify, argon2id } from "argon2";
import { surrogatePassBytes } from "./encoding.js";
export const ARGON2_OPTIONS = {
  type: argon2id,
  version: 0x13,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as const;
export function hashPassword(password: string): Promise<string> {
  return hash(Buffer.from(surrogatePassBytes(password)), ARGON2_OPTIONS);
}
let dummy: Promise<string> | undefined;
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  dummy ??= hashPassword("dummy-authentication-secret");
  const matches = await verify(encoded ?? (await dummy), Buffer.from(surrogatePassBytes(password)));
  return encoded !== null && matches;
}
