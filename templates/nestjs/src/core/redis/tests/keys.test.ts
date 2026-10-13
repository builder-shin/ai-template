import { expect, it } from "vitest";
import { redisNamespace } from "../keys.js";
it.each([
  ["redis://127.0.0.1:26379/0", "aitpl:0"],
  ["redis://127.0.0.1:26379/14", "aitpl:14"],
  ["redis://127.0.0.1:26379/15", "aitpl:15"],
  ["redis://127.0.0.1:26379", "aitpl:0"],
  ["rediss://redis.example.com:6379/15", "aitpl:15"],
])("개발·E2E·시험 네임스페이스를 나눈다: %s", (url, expected) => {
  expect(redisNamespace(url)).toBe(expected);
});
it.each(["/1", "/16", "/-1", "/15x", "/015", "/14/extra"])(
  "허용하지 않은 Redis DB를 거절한다: %s",
  (path) => {
    expect(() => redisNamespace(`redis://127.0.0.1:26379${path}`)).toThrow(
      "Redis DB는 개발 0, E2E 14, 시험 15만 쓴다",
    );
  },
);
it("Redis가 아닌 URL을 거절한다", () => {
  expect(() => redisNamespace("http://localhost/0")).toThrow();
});
