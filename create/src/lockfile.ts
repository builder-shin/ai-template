import { isDeepStrictEqual } from "node:util";
import { isMap, parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";
import { optionalReachability, type LockDocument } from "./lock-graph.ts";

export interface AppLockSource {
  readonly app: string;
  readonly source: string;
}
export function mergeApiLock(
  resolvedFrontendLock: string,
  apiLock: string,
  { typescriptPin }: { typescriptPin: string },
): string {
  const frontDocs = documents(resolvedFrontendLock, "조합"),
    apiDocs = documents(apiLock, "api");
  if (
    !isDeepStrictEqual(
      frontDocs.slice(0, -1).map((doc) => doc.toJS() as unknown),
      apiDocs.slice(0, -1).map((doc) => doc.toJS() as unknown),
    )
  )
    resolutionFailure("api", "도구 설치 문서");
  const front = dependencyDocument(frontDocs, "조합").doc.toJS() as LockDocument;
  const api = dependencyDocument(apiDocs, "api").doc.toJS() as LockDocument;
  verifyMetadata(api, front, typescriptPin, "api");
  if (!Object.hasOwn(api.importers, ".")) resolutionFailure("api", "원본 importer . 누락");
  optionalReachability(front, Object.keys(front.importers));
  optionalReachability(api, Object.keys(api.importers));
  const merged = structuredClone(front);
  const sharedConflicts: string[] = [];
  for (const [key, importer] of Object.entries(api.importers)) {
    if (key !== ".") resolutionFailure("api", `importers.${key}`);
    if (Object.hasOwn(merged.importers, "apps/api"))
      resolutionFailure("api", "apps/api importer 중복");
    merged.importers["apps/api"] = importer;
  }
  for (const section of ["packages", "snapshots"] as const) {
    for (const [key, value] of Object.entries(api[section])) {
      const existing = merged[section][key];
      if (existing !== undefined) {
        if (section === "packages" && !samePackage(value, existing, typescriptPin))
          resolutionFailure("api", `packages.${key}`);
        if (section === "snapshots" && !isDeepStrictEqual(value, existing))
          sharedConflicts.push(key);
      } else merged[section][key] = value;
    }
  }
  const reachable = optionalReachability(merged, Object.keys(merged.importers));
  for (const key of sharedConflicts)
    if (
      !sharedOptional(
        recordAt(api.snapshots, key),
        recordAt(front.snapshots, key),
        reachable.get(key) === false,
      )
    )
      resolutionFailure("api", `snapshots.${key}`);
  for (const key of Object.keys(api.snapshots)) {
    if (!Object.hasOwn(front.snapshots, key))
      merged.snapshots[key] = optionalRecord(recordAt(merged.snapshots, key), reachable.get(key));
  }
  const doc = dependencyDocument(frontDocs, "조합").doc;
  for (const section of ["importers", "packages", "snapshots"]) doc.set(section, merged[section]);
  const prefix = toolPrefix(apiLock, apiDocs, "api");
  return prefix + doc.toString({ lineWidth: 0 });
}
export function alignDerivedTypeScriptPeers(apiLock: string, typescriptPin: string): string {
  const docs = documents(apiLock, "api"),
    doc = dependencyDocument(docs, "api").doc;
  const lock = doc.toJS() as LockDocument;
  for (const [key, value] of Object.entries(lock.packages))
    doc.setIn(["packages", key], alignedPackage(value, typescriptPin));
  return toolPrefix(apiLock, docs, "api") + doc.toString({ lineWidth: 0 });
}
export function verifyAppResolutions(
  sources: readonly AppLockSource[],
  lock: string,
  { typescriptPin }: { typescriptPin: string },
): void {
  const docs = documents(lock, "조합"),
    after = dependencyDocument(docs, "조합").doc.toJS() as LockDocument;
  const originals = sources.map(({ app, source }) => ({
    app,
    source,
    docs: documents(source, app),
    before: dependencyDocument(documents(source, app), app).doc.toJS() as LockDocument,
  }));
  for (const { app, before } of originals)
    if (app === "api" && !Object.hasOwn(before.importers, "."))
      resolutionFailure(app, "원본 importer . 누락");
  const frontendSnapshots = new Map(
    originals
      .filter(({ app }) => app !== "api")
      .flatMap(({ before }) => Object.entries(before.snapshots)),
  );
  // 원본 간선의 필수 경로만 증거로 쓴다. 정렬한 node optional 표시는 전제가 아니다.
  const originalReachability = originals.map(({ before }) =>
    optionalReachability(before, Object.keys(before.importers)),
  );
  const reachable = optionalReachability(after, Object.keys(after.importers));
  for (const { app, source, docs: beforeDocs, before } of originals) {
    if (
      !isDeepStrictEqual(
        beforeDocs.slice(0, -1).map((doc) => doc.toJS() as unknown),
        docs.slice(0, -1).map((doc) => doc.toJS() as unknown),
      )
    )
      resolutionFailure(app, "도구 설치 문서");
    if (app === "api" && toolPrefix(source, beforeDocs, app) !== toolPrefix(lock, docs, "조합"))
      resolutionFailure(app, "도구 문서 원문");
    verifyMetadata(before, after, typescriptPin, app);
    for (const [key, value] of Object.entries(before.importers)) {
      if (!isDeepStrictEqual(value, after.importers[key === "." ? `apps/${app}` : key]))
        resolutionFailure(app, `${key} importer`);
    }
    for (const [key, value] of Object.entries(before.packages)) {
      if (!samePackage(value, after.packages[key], typescriptPin))
        resolutionFailure(app, `packages.${key}`);
    }
    for (const [key, value] of Object.entries(before.snapshots)) {
      const frontend = frontendSnapshots.get(key);
      let expected = value;
      if (app === "api" && !frontend) expected = optionalRecord(value, reachable.get(key));
      else if (
        app === "api" &&
        frontend &&
        sharedOptional(
          value,
          frontend,
          originalReachability.some((paths) => paths.get(key) === false),
        )
      )
        expected = frontend;
      if (!isDeepStrictEqual(expected, after.snapshots[key]))
        resolutionFailure(app, `snapshots.${key}`);
    }
  }
}

function sharedOptional(
  api: Record<string, unknown>,
  frontend: Record<string, unknown>,
  mandatory: boolean,
): boolean {
  if (
    !mandatory ||
    !Object.hasOwn(api, "optional") ||
    api.optional !== true ||
    Object.hasOwn(frontend, "optional")
  )
    return false;
  const copy = { ...api };
  Reflect.deleteProperty(copy, "optional");
  return isDeepStrictEqual(copy, frontend);
}

function recordAt(
  records: Record<string, Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const value = records[key];
  if (value === undefined) resolutionFailure("api", `snapshots.${key}`);
  return value;
}
function toolPrefix(source: string, docs: ReturnType<typeof documents>, app: string): string {
  const start = dependencyDocument(docs, app).doc.range[0];
  return source.slice(0, start);
}
function resolutionFailure(app: string, key: string): never {
  throw new CreateError(
    `${app}: ${key}: 해석 결과가 바뀌었다`,
    "원본 잠금 파일의 모든 레코드를 보존한다.",
  );
}
function alignedPackage(value: Record<string, unknown>, pin: string): Record<string, unknown> {
  const peers = value.peerDependencies as Record<string, unknown> | undefined;
  return typeof peers?.typescript === "string"
    ? { ...value, peerDependencies: { ...peers, typescript: pin } }
    : value;
}
function samePackage(before: Record<string, unknown>, after: unknown, pin: string): boolean {
  return isDeepStrictEqual(before, after) || isDeepStrictEqual(alignedPackage(before, pin), after);
}
function optionalRecord(
  value: Record<string, unknown>,
  optional: boolean | undefined,
): Record<string, unknown> {
  if (optional === undefined) return value;
  const result = { ...value };
  if (optional) result.optional = true;
  else Reflect.deleteProperty(result, "optional");
  return result;
}
function verifyMetadata(before: LockDocument, after: LockDocument, pin: string, app: string): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (["importers", "packages", "snapshots"].includes(key)) continue;
    if (key === "overrides" && app === "api" && !Object.hasOwn(before, key)) continue;
    if (!isDeepStrictEqual(before[key], after[key])) resolutionFailure(app, key);
  }
  if (!Object.hasOwn(before, "overrides") && Object.hasOwn(after, "overrides")) {
    const typescript = (
      before.importers["."]?.devDependencies as
        Record<string, { specifier?: string; version?: string }> | undefined
    )?.typescript;
    if (
      !isDeepStrictEqual(after.overrides, { typescript: pin }) ||
      typescript?.specifier !== pin ||
      typescript.version !== pin
    )
      resolutionFailure(app, "TypeScript override");
  }
}

function documents(source: string, app: string) {
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length > 0))
    throw new CreateError(
      `${app}: 잠금 파일이 올바르지 않다`,
      `${app}에서 pnpm install로 잠금 파일을 다시 만든다.`,
    );
  return docs;
}

function dependencyDocument(docs: ReturnType<typeof documents>, app: string) {
  // pnpm 12는 도구 설치 잠금과 프로젝트 의존성을 별도 YAML 문서로 저장한다.
  const doc = docs.at(-1);
  const importers = doc?.get("importers", true);
  if (!doc || !isMap(importers))
    throw new CreateError(
      `${app}: 잠금 파일에 importer가 없다`,
      `${app}에서 pnpm install로 잠금 파일을 만든다.`,
    );
  return { doc, importers };
}

export function rewriteImporters(source: string, app = "web"): string {
  const docs = documents(source, app);
  const { doc, importers } = dependencyDocument(docs, app);
  if (!importers.has("."))
    throw new CreateError(
      `${app}: 잠금 파일에 원본 importer .이 없다`,
      `${app}에서 pnpm install로 잠금 파일을 다시 만든다.`,
    );
  for (const pair of importers.items) {
    const path = String(pair.key);
    const contractPath =
      path.startsWith("contract/") &&
      !path.includes("\\") &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
    if (path !== "." && !contractPath)
      throw new CreateError(
        `${app}: 프론트 importer 경로가 올바르지 않다: ${path}`,
        `${app} workspace의 contract 패키지를 확인하고 pnpm install로 잠금 파일을 다시 만든다.`,
      );
    pair.key = doc.createNode(path === "." ? `apps/${app}` : path);
  }
  return docs
    .map((item) => {
      item.directives.docStart = true;
      return item.toString({ lineWidth: 0 });
    })
    .join("\n");
}

export interface FrontendLock {
  readonly app: string;
  readonly source: string;
}

/** 공통 키는 같은 해석만 받아들이고 앱 importer와 고유 패키지는 합친다. */
export function mergeFrontendLocks(sources: readonly FrontendLock[]): string {
  const first = sources[0];
  if (!first) throw new CreateError("프론트 잠금 파일이 없다", "프론트 앱을 하나 이상 지정한다.");
  const merged = documents(rewriteImporters(first.source, first.app), first.app);
  const target = dependencyDocument(merged, first.app).doc;
  const initial = target.toJS() as Record<string, unknown>;
  const contracts = Object.keys(initial.importers as Record<string, unknown>)
    .filter((key) => key.startsWith("contract/"))
    .sort();
  for (const source of sources.slice(1)) {
    const next = documents(rewriteImporters(source.source, source.app), source.app);
    const fail = (key: string): never => {
      throw new CreateError(
        `프론트 잠금 파일의 해석이 다르다(${first.app}, ${source.app}): ${key}`,
        "같은 계약·패키지·도구 해석으로 잠금 파일을 맞추고 커밋한다.",
      );
    };
    if (
      merged.length !== next.length ||
      !isDeepStrictEqual(
        merged.slice(0, -1).map((doc) => doc.toJS() as unknown),
        next.slice(0, -1).map((doc) => doc.toJS() as unknown),
      )
    )
      fail("도구 설치 문서");
    const incoming = dependencyDocument(next, source.app).doc.toJS() as Record<string, unknown>;
    const nextContracts = Object.keys(incoming.importers as Record<string, unknown>)
      .filter((key) => key.startsWith("contract/"))
      .sort();
    if (!isDeepStrictEqual(contracts, nextContracts)) fail("계약 importer 목록");
    for (const key of new Set([...Object.keys(initial), ...Object.keys(incoming)])) {
      if (["importers", "packages", "snapshots"].includes(key)) continue;
      if (!isDeepStrictEqual(initial[key], incoming[key])) fail(key);
    }
    for (const section of ["importers", "packages", "snapshots"]) {
      const entries = incoming[section] as Record<string, unknown> | undefined;
      const existing = (initial[section] ?? {}) as Record<string, unknown>;
      initial[section] = existing;
      for (const [key, value] of Object.entries(entries ?? {})) {
        if (Object.hasOwn(existing, key)) {
          if (!isDeepStrictEqual(existing[key], value)) fail(`${section}.${key}`);
        } else {
          existing[key] = value;
          target.setIn([section, key], value);
        }
      }
    }
  }
  return merged.map((doc) => doc.toString({ lineWidth: 0 })).join("\n");
}

export function verifyFrontendResolutions(original: string, combined: string, app = "web"): void {
  const before = dependencyDocument(documents(original, app), app).doc.toJS() as Record<
    string,
    Record<string, unknown>
  >;
  const after = dependencyDocument(documents(combined, "조합"), "조합").doc.toJS() as Record<
    string,
    Record<string, unknown>
  >;
  for (const [path, importer] of Object.entries(before.importers ?? {})) {
    const moved = path === "." ? `apps/${app}` : path;
    if (!isDeepStrictEqual(importer, after.importers?.[moved]))
      throw new CreateError(
        `${app}: ${path} importer의 해석 결과가 바뀌었다`,
        "프론트 잠금 파일의 버전을 보존해 다시 생성한다.",
      );
  }
  for (const section of ["packages", "snapshots"]) {
    for (const [key, value] of Object.entries(before[section] ?? {})) {
      const resolved =
        section === "packages" ? (value as Record<string, unknown>).resolution : value;
      const actual =
        section === "packages"
          ? (after[section]?.[key] as Record<string, unknown> | undefined)?.resolution
          : after[section]?.[key];
      if (!isDeepStrictEqual(resolved, actual))
        throw new CreateError(
          `${app}: ${key}: 해석 결과가 바뀌었다`,
          "프론트 잠금 파일의 의존성 해석을 보존한다.",
        );
    }
  }
}
