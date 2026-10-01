import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it.each(["src/lib/env.test.ts", "scripts/next-config.test.ts", "src/lib/env.ts", ".env.example"])(
  "%s의 비밀 예외 주석에는 사유가 있다",
  (path) => {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (line.includes("betterleaks:allow"))
        expect(line).toMatch(/(?:\/\/|#)\s*betterleaks:allow\s+사유:\s*\S+/);
    }
  },
);
