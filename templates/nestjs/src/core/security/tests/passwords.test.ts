import { expect, it, vi } from "vitest";
import * as argon2 from "argon2";
import { hashPassword, verifyPassword, dummyVerify } from "../passwords.js";
vi.mock("argon2", { spy: true });

it("Argon2id PHC의 버전·비용·salt·해시 길이가 고정값이다", async () => {
  const [empty, algorithm, version, params, salt, hash] = (
    await hashPassword("시험용-password")
  ).split("$");
  expect([empty, algorithm, version, params]).toEqual(["", "argon2id", "v=19", "m=65536,t=3,p=4"]);
  expect(Buffer.from(salt ?? "", "base64")).toHaveLength(16);
  expect(Buffer.from(hash ?? "", "base64")).toHaveLength(32);
});
it("짝 없는 서로게이트 비밀번호와 U+FFFD 비밀번호는 서로 검증되지 않는다", async () => {
  const hash = await hashPassword("a\uD800b");
  expect(await verifyPassword(hash, "a\uD800b")).toBe(true);
  expect(await verifyPassword(hash, "a\uFFFDb")).toBe(false);
});
it("같은 비밀번호도 매번 새로운 salt를 사용한다", async () => {
  const first = await hashPassword("시험용-password");
  const second = await hashPassword("시험용-password");
  expect(first).not.toBe(second);
  expect(await verifyPassword(second, "틀린-password")).toBe(false);
});
it("없는 계정의 가짜 검증도 실제 Argon2와 surrogatepass 바이트를 사용한다", async () => {
  const verify = vi.spyOn(argon2, "verify");
  try {
    await expect(dummyVerify("a\uD800b")).resolves.toBeUndefined();
    expect(verify).toHaveBeenCalledWith(
      expect.stringMatching(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/),
      Buffer.from("61eda08062", "hex"),
    );
  } finally {
    verify.mockRestore();
  }
});
