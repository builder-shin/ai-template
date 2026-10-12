import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { CASE_NAMES, CASE_PATTERN } from "./conformance-selection.js";
import { childEnvironment } from "./preflight-tmp.mjs";
const root = resolve(import.meta.dirname, "../../..");
export function runConformance(
  cache = resolve(import.meta.dirname, "../.cache/stack"),
  command: readonly [string, ...string[]] = ["pnpm", "conformance", "nestjs"],
): number {
  mkdirSync(cache, { recursive: true });
  const output = resolve(cache, "conformance-results.json");
  rmSync(output, { force: true });
  rmSync(resolve(cache, "conformance-counts.json"), { force: true });
  const start = new Date().toISOString(),
    tick = performance.now();
  const result = spawnSync(
    command[0],
    [
      ...command.slice(1),
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
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(output, "utf8"));
  } catch {
    console.error(
      `Conformance reporter result is missing or unreadable (child exit ${String(result.status)}).`,
    );
    return result.status === 0 ? 1 : (result.status ?? 1);
  }
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
  if (result.status === 0) {
    assert.equal(counts.numTotalTests, 94);
    assert.equal(counts.numPassedTests, 41);
    assert.equal(counts.numPendingTests, 53);
    assert.equal(counts.numFailedTests, 0);
    assert.deepEqual(passedNames, [...CASE_NAMES].sort());
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runConformance();
}
