import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { probe } from "./probe.js";

it("executes the DI graph through the selected Vitest transformer", async () => {
  const result = await probe();
  const output = process.env.DI_OUTPUT;
  if (!output) throw new Error("DI_OUTPUT is required for the isolated transformation probe");
  writeFileSync(output, `${JSON.stringify(result)}\n`);
  // 고정한 Vite 8.3.1의 기본 Oxc도 메타데이터와 전체 그래프를 보존했다.
  expect(result.graph.compiled && result.graph.verified).toBe(true);
  expect(result.misuse.rejected).toBe(true);
});
