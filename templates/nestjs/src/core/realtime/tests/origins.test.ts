import { expect, it } from "vitest";
import { normalizeOrigins, originAllowed } from "../origins.js";
it("목록을 URL Origin으로 정규화하고 중복을 없앤다", () => {
  expect(
    normalizeOrigins([
      "https://EXAMPLE.com:443/path",
      "https://example.com/",
      "http://localhost:3000/",
    ]),
  ).toEqual(["https://example.com", "http://localhost:3000"]);
});
it("Origin 헤더가 없으면 목록과 관계없이 받는다", () => {
  expect(originAllowed(undefined, [])).toBe(true);
});
it("헤더는 정규화하지 않고 허용 목록과 문자 그대로 비교한다", () => {
  const allowed = ["https://example.com"];
  expect(originAllowed("https://example.com", allowed)).toBe(true);
  for (const header of [
    "https://EXAMPLE.com",
    "https://example.com/",
    "https://example.com:443",
    "null",
    "",
    "https://evil.example",
  ])
    expect(originAllowed(header, allowed)).toBe(false);
});
