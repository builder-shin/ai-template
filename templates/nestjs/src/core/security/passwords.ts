import * as argon2 from "argon2";
import { passwordBytes } from "./encoding.js";

export async function hashPassword(password: string): Promise<string> {
  const hash = await argon2.hash(passwordBytes(password), {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });
  // 패키지의 매개변수 나열 순서만 계약 순서로 맞추고 salt와 해시 바이트는 보존한다.
  return hash.replace("$m=65536,p=4,t=3$", "$m=65536,t=3,p=4$");
}
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, passwordBytes(password));
}
let dummyHash: Promise<string> | undefined;
export async function dummyVerify(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-verification-only");
  await verifyPassword(await dummyHash, password);
}
