import { describe, expect, it } from "vitest";
import { appEnvironment } from "../e2e/targets/app";

const seed = {
  E2E_SEED_ADMIN_EMAIL: "stack-admin@example.com",
  E2E_SEED_ADMIN_PASSWORD: "stack-admin-password", // betterleaks:allow 전용 스택의 가짜 비밀번호
};

describe("관리 E2E 시드 환경", () => {
  it("목은 외부 시드 설정이 필요 없다", () => {
    expect(appEnvironment("mock", {})).toEqual({});
  });
  it("FastAPI의 시드 계정은 명시한 두 값을 전달한다", () => {
    expect(appEnvironment("fastapi", seed)).toEqual(seed);
  });
  it.each(["E2E_SEED_ADMIN_EMAIL", "E2E_SEED_ADMIN_PASSWORD"])(
    "누락·빈 값의 변수 이름만 알린다 (%s)",
    (key) => {
      for (const value of [undefined, "", " "])
        expect(() => appEnvironment("fastapi", { ...seed, [key]: value })).toThrow(key);
    },
  );
});
