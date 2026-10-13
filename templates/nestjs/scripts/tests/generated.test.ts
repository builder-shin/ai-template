import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { gitEnvironment } from "../check/git-environment.js";
it("생성 Prisma 클라이언트는 추적 후보에서 제외한다", () => {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "src/generated/prisma/client.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: gitEnvironment(),
    },
  );
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("src/generated/prisma/client.ts");
});
