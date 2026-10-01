import { describe, expect, it } from "vitest";
import { isStandalone } from "./dev-mode.mjs";

describe("개발 모드", () => {
  it.each([
    undefined,
    "http://localhost:4010/api/v1",
    "http://127.0.0.1:4010/api/v1",
    "http://[::1]:4010/api/v1/",
  ])("목 주소에서만 함께 실행한다: %s", (url) => expect(isStandalone(url)).toBe(true));
  it.each([
    "http://localhost:8000/api/v1",
    "https://api.example.com/api/v1",
    "http://localhost:4010/other",
    "invalid",
  ])("백엔드나 잘못된 주소는 목을 시작하지 않는다: %s", (url) =>
    expect(isStandalone(url)).toBe(false),
  );
});
