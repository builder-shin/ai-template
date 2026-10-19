import { expect, it } from "vitest";
import { EXAMPLE_SECRETS, settingsSchema } from "../settings.js";
import { exampleEnv } from "./env-example.js";

it("공개 환경 예시는 주석을 빼고 모든 설정 키의 문자열을 새 객체에 읽는다", () => {
  const env = exampleEnv();
  expect(Object.keys(env).sort()).toEqual(Object.keys(settingsSchema.shape).sort());
  expect(Object.values(env).every((value) => typeof value === "string")).toBe(true);
  expect(env).toMatchObject(EXAMPLE_SECRETS);
  expect(env.PORT).toBe("8000");
  env.PORT = "1";
  expect(exampleEnv().PORT).toBe("8000");
});
