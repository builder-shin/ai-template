import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBreaking } from "../../src/spec-compare/breaking.ts";

/** oasdiff는 처음 한 번 GitHub에서 받아 저장소의 node_modules/.cache에 둔다. */
const cacheDir = fileURLToPath(
  new URL("../../../node_modules/.cache/ai-template-tools", import.meta.url),
);
const fixture = (name: string) =>
  fileURLToPath(new URL(`../fixtures/specs/${name}`, import.meta.url));

describe("checkBreaking", () => {
  it("파라미터 이름 변경과 응답 필드 추가는 깨는 변경이 아니다", async () => {
    const result = await checkBreaking(
      fixture("contract.yaml"),
      fixture("compatible.yaml"),
      cacheDir,
    );
    expect(result.ok).toBe(true);
  }, 120_000);

  it("필수 응답 필드를 선택으로 바꾸면 깨는 변경으로 잡는다", async () => {
    const result = await checkBreaking(fixture("contract.yaml"), fixture("broken.yaml"), cacheDir);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("title");
  }, 120_000);
});
