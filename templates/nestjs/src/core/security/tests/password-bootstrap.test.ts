import { afterEach, expect, it, vi } from "vitest";
import * as argon2 from "argon2";
vi.mock("argon2", { spy: true });
afterEach(() => {
  vi.restoreAllMocks();
});
it("가짜 해시는 bootstrap에서 준비해 첫 없는 계정 요청 때 다시 만들지 않는다", async () => {
  vi.resetModules();
  const { prepareDummyHash, dummyVerify } = await import("../passwords.js");
  const hash = vi.spyOn(argon2, "hash");
  await prepareDummyHash();
  const calls = hash.mock.calls.length;
  await dummyVerify("a\ud800b");
  await dummyVerify("b\ud800c");
  expect(calls).toBe(1);
  expect(hash).toHaveBeenCalledTimes(1);
});
it("bootstrap 해시 실패는 호출자에게 전달하고 거절 promise를 캐시하지 않아 재시도가 된다", async () => {
  vi.resetModules();
  const { prepareDummyHash, dummyVerify } = await import("../passwords.js");
  const hash = vi.spyOn(argon2, "hash").mockRejectedValueOnce(new Error("가짜 해시 준비 실패"));
  await expect(prepareDummyHash()).rejects.toThrow("가짜 해시 준비 실패");
  await expect(prepareDummyHash()).resolves.toBeUndefined();
  await expect(dummyVerify("a\ud800b")).resolves.toBeUndefined();
  expect(hash).toHaveBeenCalledTimes(2);
});
