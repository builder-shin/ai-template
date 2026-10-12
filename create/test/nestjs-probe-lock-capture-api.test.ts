import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseAllDocuments } from "yaml";
import { expect, it } from "vitest";
import { CreateError } from "../src/errors.ts";
import { captureLockResolution, diagnoseImporterFailure } from "./nestjs-probe-lock-capture.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder } from "./helpers.ts";

const apiRefusals = [
  "pnpm new: 프론트 잠금 파일의 해석이 다르다(web, api): packages.@typescript-eslint/eslint-plugin@8.71.0 — 잠금 파일을 맞춘다.\n",
  "프론트 잠금 파일의 해석이 다르다(admin, api): packages.shared@1.0.0",
  "pnpm new: api: shared@1.0.0: 해석 결과가 바뀌었다 — 원본을 확인한다.",
];

it("API 병합·검증 거절만 native1에서 진단하고 보고 실패에도 원래 CLI 객체를 전달한다", () => {
  const original = Error("035-web-generate failed (1)");
  const sameOriginal = (operation: () => void) => {
    let caught: unknown;
    try {
      operation();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(original);
  };
  for (const stderr of apiRefusals) {
    const records: unknown[] = [];
    let diagnosticCalls = 0;
    sameOriginal(() =>
      diagnoseImporterFailure(
        original,
        { nativeExit: 1, stderr },
        () => {
          diagnosticCalls++;
          return { evidenceCaptured: true };
        },
        (record) => {
          records.push(record);
        },
      ),
    );
    // Unchanged-helper RED: API refusal produces no diagnostic record.
    expect(records).toEqual([{ result: { evidenceCaptured: true }, error: null }]);
    expect(diagnosticCalls).toBe(1);
    const diagnosticError = Error("separate diagnostic failed");
    sameOriginal(() =>
      diagnoseImporterFailure(
        original,
        { nativeExit: 1, stderr },
        () => {
          diagnosticCalls++;
          throw diagnosticError;
        },
        (record) => {
          records.push(record);
          throw Error("reporting failed");
        },
      ),
    );
    expect(records.at(-1)).toEqual({ result: null, error: diagnosticError });
    sameOriginal(() =>
      diagnoseImporterFailure(
        original,
        { nativeExit: 1, stderr },
        () => {
          diagnosticCalls++;
          return { evidenceCaptured: true };
        },
        () => {
          throw Error("reporting failed after success");
        },
      ),
    );
    expect(diagnosticCalls).toBe(3);
  }
  const negative: { nativeExit: number | null; stderr: string }[] = [
    {
      nativeExit: 1,
      stderr: "프론트 잠금 파일의 해석이 다르다(web, admin): packages.shared@1.0.0",
    },
    {
      nativeExit: 1,
      stderr: "프론트 잠금 파일의 해석이 다르다(admin, web): packages.shared@1.0.0",
    },
    { nativeExit: 1, stderr: "web: shared@1.0.0: 해석 결과가 바뀌었다" },
    { nativeExit: 1, stderr: "잠금 파일이 올바르지 않다" },
    ...apiRefusals.flatMap((stderr) => [0, null, 2].map((nativeExit) => ({ nativeExit, stderr }))),
  ];
  for (const observed of negative) {
    let diagnosticCalls = 0;
    const records: unknown[] = [];
    sameOriginal(() =>
      diagnoseImporterFailure(
        original,
        observed,
        () => {
          diagnosticCalls++;
          return { evidenceCaptured: true };
        },
        (record) => {
          records.push(record);
        },
      ),
    );
    expect(diagnosticCalls).toBe(0);
    expect(records).toEqual([]);
  }
});

it("실제 createProject phase1 공유 기록 변화는 엄격한 phase2 API 거절 전에 외부에 보존한다", () => {
  const repository = nestjsFixture();
  const initialStatus = git(repository, "status", "--porcelain");
  const parent = temporaryFolder();
  const base = process.env.AITPL_LOCK_CAPTURE_EVIDENCE ?? temporaryFolder();
  mkdirSync(base, { recursive: true });
  const evidence = mkdtempSync(join(base, "api-refusal-"));
  const target = join(parent, "diagnostic");
  const head = git(repository, "rev-parse", "HEAD").trim();
  const binding = {
    testedHead: head,
    materializationHead: head,
    synthetic: true,
    delegateKind: "pure source-derived double; not an actual resolver",
  };
  const calls: string[][] = [];
  let before = "",
    after = "",
    staging = "";
  let refusal: unknown;
  try {
    // captureLockResolution invokes the actual unchanged createProject and strict API merger.
    captureLockResolution({
      repository,
      evidenceDirectory: evidence,
      binding,
      options: {
        target,
        name: "synthetic-api-refusal",
        template: "combo",
        api: "nestjs",
        frontends: ["web"],
        git: false,
      },
      delegate(cwd, args) {
        calls.push([...args]);
        if (args[0] === "--version") return;
        expect(args).toEqual(["install", "--lockfile-only"]);
        staging = cwd;
        before = readFileSync(join(cwd, "pnpm-lock.yaml"), "utf8");
        const docs = parseAllDocuments(before);
        const doc = docs.at(-1);
        if (!doc || docs.some((item) => item.errors.length)) throw Error("Invalid fixture YAML.");
        // Pure source-derived double of the override mechanism; this is no pnpm measurement.
        doc.setIn(["importers", "."], {
          devDependencies: { typescript: { specifier: "6.0.3", version: "6.0.3" } },
        });
        doc.set("overrides", { typescript: "6.0.3" });
        doc.setIn(["packages", "shared@1.0.0", "peerDependencies"], { typescript: "6.0.3" });
        after = docs.map((item) => item.toString({ lineWidth: 0 })).join("\n");
        writeFileSync(join(cwd, "pnpm-lock.yaml"), after);
      },
    });
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(CreateError);
  expect(refusal).toMatchObject({
    problem: "프론트 잠금 파일의 해석이 다르다(web, api): packages.shared@1.0.0",
    exitCode: 1,
  });
  expect(calls).toEqual([["--version"], ["install", "--lockfile-only"]]);
  expect(existsSync(target)).toBe(false);
  expect(existsSync(staging)).toBe(false);
  expect(readdirSync(parent)).toEqual([]);
  const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
  for (const [name, raw] of [
    ["before", before],
    ["after", after],
  ] as const) {
    const path = join(evidence, name + ".pnpm-lock.yaml");
    expect(readFileSync(path, "utf8")).toBe(raw);
    expect(statSync(path).mode & 0o777).toBe(0o444);
  }
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(join(evidence, file), "utf8")) as unknown;
  expect(read("capture.json")).toMatchObject({
    binding,
    before: { sha256: digest(before) },
    after: { sha256: digest(after) },
    delegateReturnedNormally: true,
    innerNative: { pid: null, exit: null, wallSeconds: null },
    retrospectiveOriginalCandidate: false,
    compatibleResolutionAccepted: false,
  });
  const diff = read("diff.json") as { packages: unknown[] };
  expect(diff.packages).toEqual([
    {
      kind: "added",
      pointer: "/shared@1.0.0/peerDependencies",
      after: { typescript: "6.0.3" },
    },
  ]);
  for (const [app, template] of [
    ["api", "nestjs"],
    ["web", "nextjs"],
  ]) {
    if (!app || !template) throw Error("Missing source fixture.");
    expect(readFileSync(join(evidence, "sources", app + ".pnpm-lock.yaml"), "utf8")).toBe(
      readFileSync(join(repository, "templates", template, "pnpm-lock.yaml"), "utf8"),
    );
  }
  expect(git(repository, "status", "--porcelain")).toBe(initialStatus);
  // Unchanged-helper RED: the captured failure is diagnostic-failure.
  expect(read("failure.json")).toMatchObject({
    outcome: "strict-api-merge-refusal",
    exitCode: 1,
    targetAbsent: true,
    stagingAbsent: true,
    compatibleResolutionAccepted: false,
  });
});
