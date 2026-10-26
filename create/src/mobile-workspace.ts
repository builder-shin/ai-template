import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse, parseAllDocuments, stringify } from "yaml";
import { optionalReachability, type LockDocument } from "./lock-graph.ts";
import { CreateError } from "./errors.ts";
import type { PnpmRunner } from "./pnpm.ts";
import type { WorkspaceDocument } from "./workspace.ts";
import { verifyFrontendResolutions } from "./lockfile.ts";

function failure(key: string): never {
  throw new CreateError(
    `mobile: ${key}`,
    "독립 모바일 잠금·workspace 정책과 원본 해석을 보존한다.",
  );
}
function lastDocument(docs: ReturnType<typeof parseAllDocuments>) {
  const doc = docs.at(-1);
  if (!doc?.range || docs.some((item) => item.errors.length)) failure("잠금 YAML이 올바르지 않다");
  return { doc, start: doc.range[0] };
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function readLock(source: string) {
  const docs = parseAllDocuments(source),
    { doc, start } = lastDocument(docs);
  const data: unknown = doc.toJS();
  if (!record(data) || !record(data.importers) || !record(data.packages) || !record(data.snapshots))
    failure("잠금 그래프가 없다");
  const lock = data as LockDocument;
  if (!isDeepStrictEqual(lock.overrides, { typescript: "6.0.3" }))
    failure("잠금 TypeScript override가 다르다");
  if (!Object.hasOwn(lock.importers, ".")) failure("원본 importer . 누락");
  const contracts = Object.keys(lock.importers).filter((key) => key !== ".");
  if (!contracts.length || contracts.some((key) => !/^contract\/[a-zA-Z0-9_-]+$/.test(key)))
    failure("계약 importer 경로가 올바르지 않다");
  return { doc, lock, start };
}
function subset(source: string, app: boolean) {
  const { doc, lock, start } = readLock(source);
  const roots = Object.keys(lock.importers).filter((key) => (app ? key === "." : key !== "."));
  const closure = optionalReachability(lock, roots);
  const snapshots = Object.fromEntries(
    Object.entries(lock.snapshots).filter(([key]) => closure.has(key)),
  );
  const packageKeys = new Set(Object.keys(snapshots).map((key) => key.split("(")[0] ?? key));
  doc.set(
    "importers",
    app
      ? { ".": lock.importers["."] }
      : { ".": {}, ...Object.fromEntries(roots.map((key) => [key, lock.importers[key]])) },
  );
  doc.set(
    "packages",
    Object.fromEntries(Object.entries(lock.packages).filter(([key]) => packageKeys.has(key))),
  );
  doc.set("snapshots", snapshots);
  return source.slice(0, start) + doc.toString({ lineWidth: 0 });
}
export const mobileLock = (source: string): string => subset(source, true);
export const mobileContractLock = (source: string): string => subset(source, false);
export function verifyMobileContract(root: string, source: string): void {
  const expected = mobileContractLock(source),
    docs = parseAllDocuments(expected),
    { doc, start } = lastDocument(docs);
  doc.deleteIn(["importers", "."]);
  verifyFrontendResolutions(
    expected.slice(0, start) + doc.toString({ lineWidth: 0 }),
    readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
    "mobile-contract",
  );
}
export function mobileWorkspace(source: string): string {
  const policy = parse(source) as WorkspaceDocument;
  if (
    policy.minimumReleaseAge !== 1440 ||
    policy.overrides?.typescript !== "6.0.3" ||
    !policy.allowBuilds ||
    !Array.isArray(policy.packages) ||
    policy.packages.some((path) => path !== "contract/*")
  )
    failure("workspace 원본 정책이 올바르지 않다");
  return stringify({ ...policy, packages: [] });
}
export function verifyMobileBoundary(root: string, sourceLock: string): void {
  const expected = mobileLock(sourceLock),
    actual = readFileSync(join(root, "apps/mobile/pnpm-lock.yaml"), "utf8");
  const expectedDocs = parseAllDocuments(expected),
    actualDocs = parseAllDocuments(actual);
  if (
    actualDocs.some((doc) => doc.errors.length) ||
    !isDeepStrictEqual(
      expectedDocs.map((doc) => doc.toJS() as unknown),
      actualDocs.map((doc) => doc.toJS() as unknown),
    ) ||
    expected.slice(0, lastDocument(expectedDocs).start) !==
      actual.slice(0, lastDocument(actualDocs).start)
  )
    failure("해석 결과 또는 도구 원문이 바뀌었다");
}
export interface MobileBoundaryInput {
  root: string;
  sourceLock: string;
  sourceWorkspace: string;
  pnpm: PnpmRunner;
}
export function configureMobileBoundary({
  root,
  sourceLock,
  sourceWorkspace,
  pnpm,
}: MobileBoundaryInput): void {
  const mobile = join(root, "apps/mobile"),
    workspace = mobileWorkspace(sourceWorkspace);
  writeFileSync(join(mobile, "pnpm-lock.yaml"), mobileLock(sourceLock));
  writeFileSync(join(mobile, "pnpm-workspace.yaml"), workspace);
  verifyMobileBoundary(root, sourceLock);
  pnpm(mobile, ["install", "--frozen-lockfile"]);
  verifyMobileBoundary(root, sourceLock);
  if (readFileSync(join(mobile, "pnpm-workspace.yaml"), "utf8") !== workspace)
    failure("workspace 원문이 바뀌었다");
}
export function addMobileProxy(root: string): void {
  const workspace = parse(
    readFileSync(join(root, "pnpm-workspace.yaml"), "utf8"),
  ) as WorkspaceDocument;
  workspace.packages = [
    ...(workspace.packages ?? []).filter((path) => path !== "apps/mobile"),
    "tools/mobile",
  ];
  writeFileSync(join(root, "pnpm-workspace.yaml"), stringify(workspace));
  const file = join(root, "pnpm-lock.yaml"),
    source = readFileSync(file, "utf8"),
    docs = parseAllDocuments(source),
    { doc, start } = lastDocument(docs);
  doc.deleteIn(["importers", "apps/mobile"]);
  doc.setIn(["importers", "tools/mobile"], {});
  writeFileSync(file, source.slice(0, start) + doc.toString({ lineWidth: 0 }));
  const turboFile = join(root, "turbo.json"),
    turbo = JSON.parse(readFileSync(turboFile, "utf8")) as { tasks: Record<string, unknown> };
  for (const task of ["setup", "dev", "check", "fix", "test", "gen", "build", "test:e2e"])
    turbo.tasks[`mobile#${task}`] = {
      inputs: [
        "$TURBO_DEFAULT$",
        "$TURBO_ROOT$/apps/mobile/**",
        "$TURBO_ROOT$/contract/**",
        "$TURBO_ROOT$/apps/api/openapi.json",
      ],
      cache: false,
      ...(task === "gen" ? { dependsOn: ["api#gen"] } : {}),
      ...(task === "dev" ? { persistent: true } : {}),
    };
  writeFileSync(turboFile, JSON.stringify(turbo, null, 2) + "\n");
}
