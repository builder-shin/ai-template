import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { CASE_NAMES, CASE_PATTERN } from "./conformance-selection.js";
import { childEnvironment } from "./preflight-tmp.mjs";
const root = resolve(import.meta.dirname, "../../..");
const cache = resolve(import.meta.dirname, "../.cache/stack");
mkdirSync(cache, { recursive: true });
const output = resolve(cache, "conformance-results.json");
const start = new Date().toISOString(),
  tick = performance.now();
const result = spawnSync(
  "pnpm",
  [
    "conformance",
    "nestjs",
    "test/flows/",
    "-t",
    CASE_PATTERN,
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${output}`,
  ],
  {
    cwd: root,
    env: childEnvironment(),
    stdio: "inherit",
  },
);
const report: unknown = JSON.parse(readFileSync(output, "utf8"));
assert(report !== null && typeof report === "object");
const counts = report as {
  numPassedTests: number;
  numPendingTests: number;
  numFailedTests: number;
  numTotalTests: number;
  testResults: { assertionResults: { title: string; status: string }[] }[];
};
const passedNames = counts.testResults
  .flatMap((suite) => suite.assertionResults)
  .filter((test) => test.status === "passed")
  .map((test) => test.title)
  .sort();
const evidence = {
  start,
  afterReturnUtc: new Date().toISOString(),
  durationMs: performance.now() - tick,
  nativeExit: result.status,
  passed: counts.numPassedTests,
  skipped: counts.numPendingTests,
  failed: counts.numFailedTests,
  total: counts.numTotalTests,
  passedNames,
  expectedNames: CASE_NAMES,
};
writeFileSync(resolve(cache, "conformance-counts.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ conformanceEvidence: evidence }));
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  assert.equal(counts.numTotalTests, 94);
  assert.equal(counts.numPassedTests, 41);
  assert.equal(counts.numPendingTests, 53);
  assert.equal(counts.numFailedTests, 0);
  assert.deepEqual(passedNames, [...CASE_NAMES].sort());
}
