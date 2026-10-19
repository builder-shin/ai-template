import { afterEach, expect, it, vi } from "vitest";
import * as childEnvironment from "../child-environment.mjs";

afterEach(() => vi.unstubAllEnvs());

it("Windows 자식 환경은 대소문자가 다른 기존 키를 모두 교체한다", () => {
  const source = { NPM_EXECPATH: "inherited", Npm_Execpath: "duplicate", KEEP: "public" };
  expect(childEnvironment.environment({ npm_execpath: "fixture.cjs" }, source, "win32")).toEqual({
    npm_execpath: "fixture.cjs",
    KEEP: "public",
  });
  expect(source).toEqual({ NPM_EXECPATH: "inherited", Npm_Execpath: "duplicate", KEEP: "public" });
});

it("Windows의 undefined 덮어쓰기는 대소문자가 다른 키를 모두 제거한다", () => {
  expect(
    childEnvironment.environment(
      { npm_execpath: undefined },
      { NPM_EXECPATH: "inherited", npm_execpath: "duplicate", KEEP: "public" },
      "win32",
    ),
  ).toEqual({ KEEP: "public" });
});

it("Windows 자식 환경은 관련 없는 키의 대소문자와 빈 덮어쓰기를 보존한다", () => {
  expect(
    childEnvironment.environment(
      { NODE_OPTIONS: "" },
      { Node_Options: "inherited", Path: "public" },
      "win32",
    ),
  ).toEqual({ NODE_OPTIONS: "", Path: "public" });
});

it("POSIX 자식 환경은 키 대소문자를 구별하고 undefined 키만 제거한다", () => {
  expect(
    childEnvironment.environment(
      { npm_execpath: "fixture.cjs", REMOVE: undefined },
      { NPM_EXECPATH: "inherited", REMOVE: "public", KEEP: "public" },
      "linux",
    ),
  ).toEqual({ NPM_EXECPATH: "inherited", npm_execpath: "fixture.cjs", KEEP: "public" });
});

it("환경 값 조회는 Windows에서 대소문자를 무시한다", () => {
  expect(
    childEnvironment.environmentValue("npm_execpath", { NPM_EXECPATH: "fixture.cjs" }, "win32"),
  ).toBe("fixture.cjs");
});

it("환경 값 조회는 POSIX에서 대소문자를 구별한다", () => {
  expect(
    childEnvironment.environmentValue(
      "npm_execpath",
      { NPM_EXECPATH: "other", npm_execpath: "fixture.cjs" },
      "linux",
    ),
  ).toBe("fixture.cjs");
  expect(
    childEnvironment.environmentValue("npm_execpath", { NPM_EXECPATH: "other" }, "linux"),
  ).toBeUndefined();
});

it("환경 값 조회는 생략한 입력을 현재 프로세스 환경에서 읽는다", () => {
  vi.stubEnv("AITPL_CHILD_PUBLIC", "public-fixture");
  expect(childEnvironment.environmentValue("AITPL_CHILD_PUBLIC")).toBe("public-fixture");
});
