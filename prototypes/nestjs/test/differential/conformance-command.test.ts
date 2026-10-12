import { spawnSync } from "node:child_process";
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { CASE_NAMES, CASE_PATTERN } from "../../scripts/conformance-selection.js";

const repo = resolve(import.meta.dirname, "../../../..");
const { shellCommand } = (await import(resolve(repo, "scripts/src/conformance/process.ts"))) as {
  shellCommand: (argv: readonly string[]) => string;
};
const { flowTestCommand } = (await import(resolve(repo, "scripts/src/conformance/targets.ts"))) as {
  flowTestCommand: (extra: readonly string[]) => string[];
};

function forwarded(output: string) {
  return [
    "test/flows/",
    "-t",
    CASE_PATTERN,
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${output}`,
  ];
}

function declarations() {
  const plain = globSync("contract/conformance/test/flows/*.test.ts", { cwd: repo }).flatMap(
    (file) =>
      [...readFileSync(resolve(repo, file), "utf8").matchAll(/\bit\("([^"\n]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
  );
  const oauth = readFileSync(
    resolve(repo, "contract/conformance/test/flows/oauth.test.ts"),
    "utf8",
  );
  const providers = /const PROVIDERS[^=]*=\s*\[([^\]]+)\]/.exec(oauth)?.[1] ?? "";
  const first = /it\.each\(PROVIDERS\)\(\s*"([^"\n]+)"/.exec(oauth)?.[1] ?? "";
  const table = /it\.each\(\[([\s\S]*?)\] as const\)\(\s*"([^"\n]+)"/.exec(oauth);
  return [
    ...plain,
    ...[...providers.matchAll(/"([^"]+)"/g)].map((match) => first.replace("%s", match[1] ?? "")),
    ...[...(table?.[1] ?? "").matchAll(/^\s*\["([^"]+)"/gm)].map((match) =>
      (table?.[2] ?? "").replace("%s", match[1] ?? ""),
    ),
  ];
}

it("passes every forwarded argument through the actual unchanged shared shell guard", () => {
  const extra = forwarded(resolve(repo, "prototypes/nestjs/.cache/stack/conformance-results.json"));
  expect(() => shellCommand(extra)).not.toThrow();
  expect(() => shellCommand(flowTestCommand(extra))).not.toThrow();
});

it("roundtrips the exact forwarded argv through a shell and an inert Node child", () => {
  const directory = mkdtempSync(join(tmpdir(), "aitpl-nestjs-proto-argv-"));
  try {
    const child = join(directory, "argv.mjs");
    writeFileSync(child, "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
    const extra = forwarded(join(directory, "report with spaces.json"));
    const result = spawnSync(shellCommand([process.execPath, child, ...extra]), {
      shell: true,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(extra);
    const returned = JSON.parse(result.stdout) as string[];
    const pattern = new RegExp(returned[2] ?? "");
    const all = declarations();
    expect(all).toHaveLength(94);
    expect(all.filter((name) => pattern.test(`suite (nestjs) > ${name}`)).sort()).toEqual(
      [...CASE_NAMES].sort(),
    );
    expect(all.filter((name) => !pattern.test(`suite (nestjs) > ${name}`))).toHaveLength(53);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("preserves exact punctuation, Unicode and suite-prefix selection without appended titles", () => {
  const pattern = new RegExp(CASE_PATTERN);
  for (const name of CASE_NAMES) {
    for (const prefix of ["", "suite (nestjs) ", "suite > nested > "]) {
      expect(pattern.test(prefix + name)).toBe(true);
      for (const suffix of [" extra", ".", "한글", "\nextra", "\n"]) {
        expect(pattern.test(prefix + name + suffix)).toBe(false);
      }
    }
  }
  expect(declarations().filter((name) => pattern.test(name))).toHaveLength(41);
});

it("keeps dangerous characters rejected by the shared guard", () => {
  for (const character of ['"', "$", "`", "%"]) {
    expect(() => shellCommand(["node", `unsafe${character}argument`])).toThrow();
  }
});

// Synthetic reports below exercise the wrapper; they are never infrastructure evidence.
function fakeReport(failed = false) {
  const assertions = declarations().map((title) => ({
    title,
    status: CASE_NAMES.some((name) => name === title) ? "passed" : "pending",
  }));
  if (failed) {
    const selected = assertions.find((test) => test.status === "passed");
    if (!selected) throw new Error("Expected a selected declaration.");
    selected.status = "failed";
  }
  return {
    numPassedTests: failed ? 40 : 41,
    numPendingTests: 53,
    numFailedTests: failed ? 1 : 0,
    numTotalTests: 94,
    testResults: [{ assertionResults: assertions }],
  };
}

function withFakeCommand(
  mode: string,
  fixture: unknown,
  stale: boolean,
  verify: (result: ReturnType<typeof spawnSync>, directory: string) => void,
) {
  const directory = mkdtempSync(join(tmpdir(), "aitpl-nestjs-proto-report-"));
  try {
    const output = join(directory, "conformance-results.json");
    const counts = join(directory, "conformance-counts.json");
    const fixturePath = join(directory, "synthetic-fixture.json");
    writeFileSync(fixturePath, JSON.stringify(fixture));
    if (stale) {
      writeFileSync(output, JSON.stringify(fakeReport()));
      writeFileSync(counts, "stale-success");
    }
    const child = join(directory, "fake-command.mjs");
    writeFileSync(
      child,
      `
      import { copyFileSync, writeFileSync } from "node:fs";
      import { dirname, join } from "node:path";
      const mode = process.argv[2];
      const output = process.argv.find((arg) => arg.startsWith("--outputFile.json="))
        .slice("--outputFile.json=".length);
      writeFileSync(join(dirname(output), "argv.json"), JSON.stringify(process.argv.slice(3)));
      if (mode === "passed" || mode === "failed2") {
        copyFileSync(join(dirname(output), "synthetic-fixture.json"), output);
      }
      if (mode === "malformed2") writeFileSync(output, "invalid JSON");
      process.exitCode = mode.endsWith("2") ? 2 : 0;
    `,
    );
    const driver = join(directory, "driver.mjs");
    const moduleUrl = new URL("../../scripts/conformance.ts", import.meta.url).href;
    writeFileSync(
      driver,
      `
      import { runConformance } from ${JSON.stringify(moduleUrl)};
      process.exitCode = runConformance(process.argv[2], [process.execPath, process.argv[3], process.argv[4]]);
    `,
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", driver, directory, child, mode],
      {
        cwd: resolve(repo, "prototypes/nestjs"),
        encoding: "utf8",
      },
    );
    const actual: unknown = JSON.parse(readFileSync(join(directory, "argv.json"), "utf8"));
    expect(actual).toEqual(forwarded(output));
    expect(() => shellCommand(flowTestCommand(forwarded(output)))).not.toThrow();
    verify(result, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it.each([
  { mode: "missing2", stale: false, expected: 2 },
  { mode: "missing0", stale: false, expected: 1 },
  { mode: "missing2", stale: true, expected: 2 },
  { mode: "missing0", stale: true, expected: 1 },
  { mode: "malformed2", stale: false, expected: 2 },
])(
  "fails $mode with stale=$stale and preserves native exit $expected",
  ({ mode, stale, expected }) => {
    withFakeCommand(mode, null, stale, (result, directory) => {
      expect(result.status).toBe(expected);
      expect(result.stderr).toContain("Conformance reporter result is missing or unreadable");
      expect(result.stderr).not.toContain("ENOENT");
      expect(result.stdout).not.toContain("conformanceEvidence");
      expect(() => readFileSync(join(directory, "conformance-counts.json"))).toThrow();
    });
  },
);

it("retains a newly produced failed report and its counts with the native child status", () => {
  const fixture = fakeReport(true);
  withFakeCommand("failed2", fixture, true, (result, directory) => {
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(readFileSync(join(directory, "conformance-results.json"), "utf8"))).toEqual(
      fixture,
    );
    const evidence: unknown = JSON.parse(
      readFileSync(join(directory, "conformance-counts.json"), "utf8"),
    );
    expect(evidence).toMatchObject({
      nativeExit: 2,
      passed: 40,
      skipped: 53,
      failed: 1,
      total: 94,
    });
  });
});

it("accepts a newly produced exact report through the unchanged success assertions", () => {
  withFakeCommand("passed", fakeReport(), true, (result, directory) => {
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const evidence: unknown = JSON.parse(
      readFileSync(join(directory, "conformance-counts.json"), "utf8"),
    );
    expect(evidence).toMatchObject({
      nativeExit: 0,
      passed: 41,
      skipped: 53,
      failed: 0,
      total: 94,
    });
  });
});

it("rejects a zero child exit when a fresh report has the wrong counts", () => {
  withFakeCommand("passed", fakeReport(true), false, (result) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AssertionError");
  });
});

it("rejects a zero child exit when correct counts hide a different passed name", () => {
  const fixture = fakeReport();
  const selected = fixture.testResults[0]?.assertionResults.find(
    (test) => test.status === "passed",
  );
  if (!selected) throw new Error("Expected a selected declaration.");
  selected.title = "unapproved title";
  withFakeCommand("passed", fixture, false, (result) => {
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AssertionError");
  });
});
