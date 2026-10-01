import { expect, it } from "vitest";
import { assembleSteps } from "./steps";

it.each([false, true])("hook과 권한 변경은 테스트 캐시를 무효화한다 (fast=%s)", (fast) => {
  const related = fast ? ["src/lib/env.ts"] : [];
  const name = fast ? "related-tests" : "tests";
  for (const path of [".claude/hooks/pre-tool-use.mjs", ".claude/settings.json"]) {
    const key = (files: Record<string, string>) =>
      assembleSteps(files, fast, related).find((step) => step.name === name)!.key;
    expect(key({ [path]: "before" })).not.toBe(key({ [path]: "after" }));
    expect(key({ [path]: "before" })).not.toBe(key({}));
  }
});
