import { expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CASE_NAMES, CASE_PATTERN } from "../scripts/conformance-selection.js";
it("selects exactly the accepted 41 of the unchanged 94 declarations", () => {
  const root = resolve(import.meta.dirname, "fixtures/conformance-flows");
  const all = globSync("*.test.ts.txt", { cwd: root }).flatMap((p) =>
    [...readFileSync(resolve(root, p), "utf8").matchAll(/\bit\("([^"\n]+)"/g)].map(
      (m) => m[1] ?? "",
    ),
  );
  // OAuth declares three provider rows and two verification rows through it.each.
  // They are all outside this prototype slice; no flow setup or infrastructure runs here.
  const oauth = readFileSync(resolve(root, "oauth.test.ts.txt"), "utf8");
  const providers = /const PROVIDERS[^=]*=\s*\[([^\]]+)\]/.exec(oauth)?.[1] ?? "";
  const table = /it\.each\(\[([\s\S]*?)\] as const\)/.exec(oauth)?.[1] ?? "";
  const parameterized =
    [...providers.matchAll(/"[^"]+"/g)].length + [...table.matchAll(/^\s*\[/gm)].length;
  expect(parameterized).toBe(5);
  expect(all.length + parameterized).toBe(94);
  expect(CASE_NAMES).toHaveLength(41);
  const selected = all.filter((name) => new RegExp(CASE_PATTERN).test(`suite (nestjs) ${name}`));
  expect(selected.sort()).toEqual([...CASE_NAMES].sort());
  expect(all.length + parameterized - selected.length).toBe(53);
  expect(new RegExp(CASE_PATTERN).test(`suite > ${CASE_NAMES[0]} extra`)).toBe(false);
});
