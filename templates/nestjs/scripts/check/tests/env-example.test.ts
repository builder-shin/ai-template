import { expect, it } from "vitest";
import { envExampleProblems } from "../env-example.js";

it("없는 설정 키와 스키마에 없는 예시 키를 위치와 함께 알린다", () => {
  expect(envExampleProblems("A=1\nB=2\n", ["A", "C"])).toEqual([
    ".env.example:2 B — 설정 스키마에 없는 키다",
    ".env.example — 설정 키 C가 없다",
  ]);
});
it("주석·빈 줄·빈 값과 인라인 주석을 허용한다", () => {
  expect(envExampleProblems("# 설명\n\nA=\nB=2 # 설명\n", ["A", "B"])).toEqual([]);
});
it("같은 키를 두 번 적으면 두 번째 줄을 알린다", () => {
  expect(envExampleProblems("A=1\nA=2\n", ["A"])).toEqual([".env.example:2 A — 키가 중복이다"]);
});
