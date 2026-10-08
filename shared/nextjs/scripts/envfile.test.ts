import { describe, expect, it } from "vitest";
import { mergeEnv, envKeys } from "./envfile.mjs";

describe("환경 파일 병합", () => {
  it("없으면 예시 전체를 쓰고 기존 값과 주석은 보존한다", () => {
    expect(mergeEnv(undefined, "# 개발\nA=one\nB=two\n")).toBe("# 개발\nA=one\nB=two\n");
    expect(mergeEnv("# 개인\nA=custom", "A=one\nB=two\n")).toBe("# 개인\nA=custom\nB=two\n");
  });
  it("빈 값, export, CRLF와 중복 키를 다루고 두 번째 실행은 그대로다", () => {
    const current = "export A=\r\nB=mine\r\n";
    const example = "A=one\nB=two\nC=three\nC=four\n";
    const merged = mergeEnv(current, example);
    expect(merged).toBe(`${current}C=three\r\n`);
    expect(mergeEnv(merged, example)).toBe(merged);
    expect(envKeys("# A=no\n export B = yes\nC='x=y'\n")).toEqual(["B", "C"]);
  });
});
