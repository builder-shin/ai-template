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
import { parseAllDocuments, stringify } from "yaml";
import { expect, it } from "vitest";
import { CreateError } from "../src/errors.ts";
import { captureLockResolution, diagnoseImporterFailure } from "./nestjs-probe-lock-capture.ts";
import { nestjsFixture } from "./nestjs-fixture.ts";
import { git, temporaryFolder } from "./helpers.ts";

it("retains external synthetic lock evidence through strict refusal and original CLI failure", () => {
  // Removing capture, weakening refusal, or allowing a later runner phase breaks this case.
  const repository = nestjsFixture();
  const initialStatus = git(repository, "status", "--porcelain");
  const parent = temporaryFolder();
  const base = process.env.AITPL_LOCK_CAPTURE_EVIDENCE ?? temporaryFolder();
  mkdirSync(base, { recursive: true });
  const evidence = mkdtempSync(join(base, "capture-"));
  const target = join(parent, "diagnostic");
  const head = git(repository, "rev-parse", "HEAD").trim();
  const binding = {
    testedHead: head,
    materializationHead: head,
    originalNativeFailure: { nativeExit: 1, stderr: "web: . importer의 해석 결과가 바뀌었다" },
    synthetic: true,
  };
  const calls: string[][] = [];
  let before = "";
  let after = "";
  let staging = "";
  let refusal: unknown;
  try {
    captureLockResolution({
      repository,
      evidenceDirectory: evidence,
      binding,
      options: {
        target,
        name: "synthetic-lock-diagnostic",
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
        docs.at(-1)?.setIn(["importers", "apps/web", "dependencies", "react", "version"], "19.3.1");
        after = docs.map((d) => stringify(d.toJS() as unknown)).join("---\n");
        writeFileSync(join(cwd, "pnpm-lock.yaml"), after);
      },
    });
  } catch (error) {
    refusal = error;
  }
  expect(refusal).toBeInstanceOf(CreateError);
  expect(refusal).toMatchObject({ problem: "web: . importer의 해석 결과가 바뀌었다", exitCode: 1 });
  expect(calls).toEqual([["--version"], ["install", "--lockfile-only"]]);
  expect(existsSync(target)).toBe(false);
  expect(existsSync(staging)).toBe(false);
  expect(readdirSync(parent)).toEqual([]);
  // The compiling pass-through RED reaches this assertion after real refusal/cleanup.
  expect(existsSync(join(evidence, "before.pnpm-lock.yaml"))).toBe(true);
  const digest = (raw: string) => createHash("sha256").update(raw).digest("hex");
  for (const [name, raw] of [
    ["before", before],
    ["after", after],
  ] as const) {
    const path = join(evidence, name + ".pnpm-lock.yaml");
    expect(readFileSync(path, "utf8")).toBe(raw);
    // Windows exposes readonly bits differently; test their actual native representation.
    expect(statSync(path).mode & 0o777).toBe(0o444);
  }
  const capture = JSON.parse(readFileSync(join(evidence, "capture.json"), "utf8")) as Record<
    string,
    unknown
  >;
  expect(capture).toMatchObject({
    binding,
    before: { sha256: digest(before) },
    after: { sha256: digest(after) },
    delegateReturnedNormally: true,
    innerNative: { pid: null, exit: null, wallSeconds: null },
  });
  const diff = JSON.parse(readFileSync(join(evidence, "diff.json"), "utf8")) as {
    documents: unknown[];
    sourceImporters: unknown[];
  };
  expect(diff.documents).toEqual([
    {
      kind: "changed",
      pointer: "/1/importers/apps~1web/dependencies/react/version",
      before: "19.3.0",
      after: "19.3.1",
    },
  ]);
  expect(diff.sourceImporters).toEqual([
    {
      app: "api",
      importer: ".",
      differences: [
        {
          kind: "removed",
          pointer: "",
          before: (() => {
            const source = parseAllDocuments(
              readFileSync(join(repository, "templates/nestjs/pnpm-lock.yaml"), "utf8"),
            )
              .at(-1)
              ?.toJS() as { importers?: Record<string, unknown> } | undefined;
            const importer = source?.importers?.["."];
            if (importer === undefined) throw Error("Missing original API importer.");
            return importer;
          })(),
        },
      ],
    },
    {
      app: "web",
      importer: ".",
      differences: [
        {
          kind: "changed",
          pointer: "/dependencies/react/version",
          before: "19.3.0",
          after: "19.3.1",
        },
      ],
    },
  ]);
  expect(readFileSync(join(evidence, "sources/web.pnpm-lock.yaml"), "utf8")).toBe(
    readFileSync(join(repository, "templates/nextjs/pnpm-lock.yaml"), "utf8"),
  );
  expect(JSON.parse(readFileSync(join(evidence, "failure.json"), "utf8")) as unknown).toMatchObject(
    { outcome: "strict-refusal", exitCode: 1, targetAbsent: true, stagingAbsent: true },
  );
  const original = Error("035-web-generate failed (1)");
  const records: unknown[] = [];
  const sameOriginal = (operation: () => void) => {
    let caught: unknown;
    try {
      operation();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(original);
  };
  sameOriginal(() =>
    diagnoseImporterFailure(
      original,
      binding.originalNativeFailure,
      () => ({ evidenceCaptured: true }),
      (r) => {
        records.push(r);
      },
    ),
  );
  expect(records).toEqual([{ result: { evidenceCaptured: true }, error: null }]);
  const bounded = mkdtempSync(join(base, "bounded-"));
  const boundedCalls: string[][] = [];
  let boundedStaging = "";
  sameOriginal(() =>
    diagnoseImporterFailure(
      original,
      binding.originalNativeFailure,
      () => {
        captureLockResolution({
          repository,
          evidenceDirectory: bounded,
          binding,
          options: {
            target: join(parent, "bounded"),
            name: "synthetic-lock-bounded",
            template: "combo",
            api: "nestjs",
            frontends: ["web"],
            git: false,
          },
          delegate(cwd, args) {
            boundedCalls.push([...args]);
            if (args[0] !== "--version") boundedStaging = cwd;
          },
        });
      },
      (r) => {
        records.push(r);
      },
    ),
  );
  expect(boundedCalls).toEqual([["--version"], ["install", "--lockfile-only"]]);
  expect(existsSync(boundedStaging)).toBe(false);
  expect(readdirSync(parent)).toEqual([]);
  expect(JSON.parse(readFileSync(join(bounded, "failure.json"), "utf8")) as unknown).toMatchObject({
    outcome: "inconclusive-boundary-stop",
    targetAbsent: true,
    stagingAbsent: true,
  });
  expect(existsSync(join(bounded, "after.pnpm-lock.yaml"))).toBe(true);
  sameOriginal(() =>
    diagnoseImporterFailure(
      original,
      binding.originalNativeFailure,
      () => null,
      () => {
        throw Error("record failed");
      },
    ),
  );
  expect(git(repository, "status", "--porcelain")).toBe(initialStatus);
});
