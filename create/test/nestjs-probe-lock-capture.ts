import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseAllDocuments } from "yaml";
import { createProject } from "../src/create.ts";
import { parseArguments, type CreateOptions } from "../src/arguments.ts";
import { CreateError, errorReason } from "../src/errors.ts";
import { runGit } from "../src/git.ts";
import { runPnpm, type PnpmRunner } from "../src/pnpm.ts";

export interface CaptureOptions {
  options: CreateOptions;
  repository: string;
  evidenceDirectory: string;
  binding: Record<string, unknown>;
  delegate?: PnpmRunner;
}
interface Difference {
  kind: "added" | "removed" | "changed";
  pointer: string;
  before?: unknown;
  after?: unknown;
}
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const pointer = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");

/** Full deterministic leaf differences; absent fields remain distinguishable from null. */
export function differences(before: unknown, after: unknown, path = ""): Difference[] {
  if (isDeepStrictEqual(before, after)) return [];
  if (
    (Array.isArray(before) && Array.isArray(after)) ||
    (before !== null &&
      after !== null &&
      typeof before === "object" &&
      typeof after === "object" &&
      !Array.isArray(before) &&
      !Array.isArray(after))
  ) {
    const a = before as Record<string, unknown>,
      b = after as Record<string, unknown>;
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .sort()
      .flatMap((key) => differences(a[key], b[key], path + "/" + pointer(key)));
  }
  return [
    {
      kind: before === undefined ? "added" : after === undefined ? "removed" : "changed",
      pointer: path,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    },
  ];
}
function documents(raw: string): unknown[] {
  const docs = parseAllDocuments(raw);
  if (docs.some((d) => d.errors.length)) throw Error("Diagnostic lock YAML cannot be parsed");
  return docs.map((d) => d.toJS() as unknown);
}
function within(root: string, path: string): boolean {
  const part = relative(root, path);
  return (
    part === "" ||
    (!isAbsolute(part) && part !== ".." && !part.startsWith("../") && !part.startsWith("..\\"))
  );
}

export function captureLockResolution(input: CaptureOptions): void {
  const { options, repository, binding } = input;
  const evidence = resolve(input.evidenceDirectory);
  if (options.template !== "combo" || options.api !== "nestjs" || existsSync(options.target))
    throw Error("Diagnostic requires an absent dedicated NestJS combo target");
  const parsed = parseArguments([
    options.target,
    "--api",
    "nestjs",
    ...(options.frontends ?? []).map((f) => "--" + f),
    "--name",
    options.name,
  ]);
  if (parsed === "help" || parsed.name !== options.name || within(options.target, evidence))
    throw Error("Invalid diagnostic target/name/evidence boundary");
  mkdirSync(evidence, { recursive: true });
  const outputs: Record<string, { bytes: number; sha256: string; mode: number }> = {};
  const save = (file: string, value: unknown, raw = false) => {
    const content = raw ? String(value) : JSON.stringify(value, null, 2) + "\n";
    const path = join(evidence, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, { flag: "wx", mode: 0o444 });
    chmodSync(path, 0o444);
    outputs[file] = {
      bytes: Buffer.byteLength(content),
      sha256: hash(content),
      mode: statSync(path).mode & 0o777,
    };
  };
  const sources = ["api", ...(options.frontends ?? [])].map((app) => {
    const template = app === "api" ? "nestjs" : app === "web" ? "nextjs" : "nextjs-admin";
    const path = join(repository, "templates", template, "pnpm-lock.yaml");
    const source = readFileSync(path, "utf8");
    save("sources/" + app + ".pnpm-lock.yaml", source, true);
    return { app, source, sha256: hash(source), sourceMode: statSync(path).mode & 0o777 };
  });
  const repositoryHead = runGit(repository, ["rev-parse", "HEAD"]).trim();
  const state: { staging: string | null; captured: boolean; boundaryStop: boolean } = {
    staging: null,
    captured: false,
    boundaryStop: false,
  };
  const delegate = input.delegate ?? runPnpm;
  const runner: PnpmRunner = (cwd, args) => {
    if (state.captured) {
      state.boundaryStop = true;
      throw new CreateError(
        "Diagnostic boundary stop before frozen/format/gen",
        "No compatible-resolution acceptance is claimed.",
      );
    }
    if (args.length === 1 && args[0] === "--version") {
      delegate(cwd, args);
      return;
    }
    if (!isDeepStrictEqual(args, ["install", "--lockfile-only"]))
      throw Error("Unexpected diagnostic pnpm phase");
    state.staging = cwd;
    if (within(cwd, evidence)) throw Error("Diagnostic evidence is inside generation staging");
    const lock = join(cwd, "pnpm-lock.yaml");
    const before = readFileSync(lock, "utf8");
    const beforeMode = statSync(lock).mode & 0o777;
    save("before.pnpm-lock.yaml", before, true);
    const files = [
      "package.json",
      "pnpm-workspace.yaml",
      "apps/api/package.json",
      ...(options.frontends ?? []).map((f) => "apps/" + f + "/package.json"),
      "contract/mock/package.json",
      "contract/typespec/package.json",
    ];
    const inputs = Object.fromEntries(
      files.map((file) => {
        const path = join(cwd, file);
        if (!existsSync(path)) return [file, { present: false }];
        const raw = readFileSync(path, "utf8");
        return [
          file,
          {
            present: true,
            raw,
            bytes: Buffer.byteLength(raw),
            sha256: hash(raw),
            mode: statSync(path).mode & 0o777,
          },
        ];
      }),
    );
    save("inputs.json", {
      binding,
      repositoryHead,
      target: options.target,
      name: options.name,
      sources: sources.map(({ app, sha256, sourceMode }) => ({ app, sha256, sourceMode })),
      files: inputs,
    });
    const utcStart = new Date().toISOString(),
      start = performance.now();
    let returned = false,
      delegateError: unknown = null;
    try {
      delegate(cwd, args);
      returned = true;
    } catch (error) {
      delegateError = error;
      throw error;
    } finally {
      const utcEnd = new Date().toISOString(),
        wallSeconds = (performance.now() - start) / 1000;
      state.captured = true;
      const after = existsSync(lock) ? readFileSync(lock, "utf8") : null;
      if (after !== null) save("after.pnpm-lock.yaml", after, true);
      save("capture.json", {
        binding,
        repositoryHead,
        target: options.target,
        name: options.name,
        staging: cwd,
        args,
        before: {
          sha256: hash(before),
          bytes: Buffer.byteLength(before),
          sourceMode: beforeMode,
          evidenceMode: outputs["before.pnpm-lock.yaml"]?.mode,
        },
        after:
          after === null
            ? { present: false }
            : {
                present: true,
                sha256: hash(after),
                bytes: Buffer.byteLength(after),
                sourceMode: statSync(lock).mode & 0o777,
                evidenceMode: outputs["after.pnpm-lock.yaml"]?.mode,
              },
        delegateReturnedNormally: returned,
        delegateError: delegateError === null ? null : errorReason(delegateError),
        wrapper: { utcStart, utcEnd, wallSeconds, meaning: "enclosing runPnpm wrapper only" },
        innerNative: {
          pid: null,
          exit: null,
          wallSeconds: null,
          meaning: "unavailable from unchanged runPnpm",
        },
        retrospectiveOriginalCandidate: false,
        compatibleResolutionAccepted: false,
      });
      if (after !== null) {
        const a = documents(before),
          b = documents(after);
        const beforeData = object(a.at(-1)),
          afterData = object(b.at(-1));
        const sourceImporters = sources.flatMap(({ app, source }) => {
          const importers = object(object(documents(source).at(-1)).importers);
          return Object.keys(importers)
            .sort()
            .flatMap((key) => {
              const diff = differences(
                importers[key],
                object(afterData.importers)[key === "." ? "apps/" + app : key],
              );
              return diff.length ? [{ app, importer: key, differences: diff }] : [];
            });
        });
        const metadata = (data: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(data).filter(
              ([k]) => !["importers", "packages", "snapshots"].includes(k),
            ),
          );
        save("diff.json", {
          documents: differences(a, b),
          importers: differences(beforeData.importers, afterData.importers),
          packages: differences(beforeData.packages, afterData.packages),
          snapshots: differences(beforeData.snapshots, afterData.snapshots),
          metadata: differences(metadata(beforeData), metadata(afterData)),
          sourceImporters,
        });
      }
    }
  };
  try {
    createProject(options, repository, { pnpm: runner });
  } catch (error) {
    save("failure.json", {
      binding,
      outcome: state.boundaryStop
        ? "inconclusive-boundary-stop"
        : error instanceof CreateError && error.problem.includes("importer의 해석 결과가 바뀌었다")
          ? "strict-refusal"
          : "diagnostic-failure",
      error: errorReason(error),
      exitCode: error instanceof CreateError ? error.exitCode : 1,
      targetAbsent: !existsSync(options.target),
      staging: state.staging,
      stagingAbsent: state.staging === null ? null : !existsSync(state.staging),
      compatibleResolutionAccepted: false,
    });
    save("evidence.json", outputs);
    throw error;
  }
  throw Error("Diagnostic unexpectedly crossed the lock boundary");
}

/** Dedicated validated diagnostic invocation; normal native CLI argv is never rewritten. */
export function diagnosticPlan(
  runnerTemp: string,
  id: string,
  originalName: string,
  directory: string,
  frontends: readonly string[],
) {
  const target = join(runnerTemp, "aitpl-nestjs-" + id + "-lock-diagnostic"),
    name = originalName + "-lockdiag";
  if (existsSync(target) || name.length > 50 || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name))
    throw Error("Invalid or existing dedicated lock diagnostic target/name");
  const bindingPath = join(directory, "lock-diagnostic-binding.json");
  return {
    label: id + "-lock-diagnostic",
    target,
    name,
    bindingPath,
    args: [
      "run",
      "probe:nestjs:lock-capture",
      "--evidence-dir",
      join(directory, "lock-resolution"),
      "--binding-path",
      bindingPath,
      "--",
      target,
      "--api",
      "nestjs",
      ...frontends.map((f) => "--" + f),
      "--name",
      name,
    ],
  };
}

/** Always propagate the same measured normal CLI failure, including failed diagnostics/reporting. */
export function diagnoseImporterFailure(
  original: unknown,
  observed: { nativeExit: number | null; stderr: string },
  diagnostic: () => unknown,
  record: (result: { result: unknown; error: unknown }) => void,
): never {
  if (
    observed.nativeExit === 1 &&
    /(?:web|admin): \. importer의 해석 결과가 바뀌었다/.test(observed.stderr)
  ) {
    let result: unknown = null,
      error: unknown = null;
    try {
      result = diagnostic();
    } catch (caught) {
      error = caught;
    }
    try {
      record({ result, error });
    } catch {
      // Diagnostic reporting must not replace the original measured CLI failure.
    }
  }
  throw original;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.env.GITHUB_ACTIONS !== "true") throw Error("Real lock diagnostic runs only in CI");
  const [evidenceFlag, evidence, bindingFlag, bindingPath, separator, ...args] =
    process.argv.slice(2);
  if (
    evidenceFlag !== "--evidence-dir" ||
    !evidence ||
    bindingFlag !== "--binding-path" ||
    !bindingPath ||
    separator !== "--"
  )
    throw Error("Invalid diagnostic arguments");
  const options = parseArguments(args);
  if (options === "help") throw Error("Diagnostic requires combo arguments");
  try {
    captureLockResolution({
      options,
      repository: resolve(import.meta.dirname, "../.."),
      evidenceDirectory: evidence,
      binding: JSON.parse(readFileSync(bindingPath, "utf8")) as Record<string, unknown>,
    });
  } catch (error) {
    console.error(errorReason(error));
    process.exitCode = error instanceof CreateError ? error.exitCode : 1;
  }
}
