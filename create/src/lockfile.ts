import { isDeepStrictEqual } from "node:util";
import { isMap, parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";
import {
  applyOptionalGraph,
  optionalGraph,
  withoutOptional,
  type LockGraph,
} from "./lock-graph.ts";

function documents(source: string) {
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length > 0))
    throw new CreateError("잠금 파일이 올바르지 않다", "프론트 잠금 파일을 pnpm으로 다시 만든다.");
  return docs;
}

function dependencyDocument(docs: ReturnType<typeof documents>) {
  // pnpm 12는 도구 설치 잠금과 프로젝트 의존성을 별도 YAML 문서로 저장한다.
  const doc = docs.at(-1);
  const importers = doc?.get("importers", true);
  if (!doc || !isMap(importers))
    throw new CreateError(
      "잠금 파일에 importer가 없다",
      "프론트에서 pnpm install로 잠금 파일을 만든다.",
    );
  return { doc, importers };
}

export function rewriteImporters(source: string, app = "web"): string {
  const docs = documents(source);
  const { doc, importers } = dependencyDocument(docs);
  for (const pair of importers.items) {
    const path = String(pair.key);
    if (path !== "." && !path.startsWith("contract/"))
      throw new CreateError(
        "프론트 importer 경로가 올바르지 않다",
        "프론트 workspace의 contract 패키지를 확인한다.",
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
  const merged = documents(rewriteImporters(first.source, first.app));
  const target = dependencyDocument(merged).doc;
  const initial = target.toJS() as Record<string, unknown>;
  const contracts = Object.keys(initial.importers as Record<string, unknown>)
    .filter((key) => key.startsWith("contract/"))
    .sort();
  for (const source of sources.slice(1)) {
    const next = documents(rewriteImporters(source.source, source.app));
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
    const incoming = dependencyDocument(next).doc.toJS() as Record<string, unknown>;
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
  const before = dependencyDocument(documents(original)).doc.toJS() as Record<
    string,
    Record<string, unknown>
  >;
  const after = dependencyDocument(documents(combined)).doc.toJS() as Record<
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

/** NestJS api만 전역 optional 도달성으로 통합하고 프론트끼리는 기존 엄격 비교를 쓴다. */
export function mergeAppLocks(sources: readonly FrontendLock[]): string {
  const apis = sources.filter(({ app }) => app === "api");
  if (!apis.length) return mergeFrontendLocks(sources);
  const api = apis[0];
  if (apis.length !== 1 || !api)
    throw new CreateError("api 잠금 파일을 하나만 지정한다", "백엔드 importer 입력을 확인한다.");
  const frontends = sources.filter(({ app }) => app !== "api");
  const resolved = mergeFrontendLocks(frontends);
  for (const source of sources)
    optionalGraph(dependencyDocument(documents(source.source)).doc.toJS() as LockGraph);
  const combined = mergeApiLock({ app: String(frontends[0]?.app), source: resolved }, api);
  for (const source of sources) verifyAppResolutions(source.source, combined, source.app);
  return combined;
}

/** 해석된 프런트 잠금은 그대로 두고 원본 api만 엄격히 추가한다. */
export function mergeApiLock(
  resolved: FrontendLock,
  api: FrontendLock,
  expectedTypeScript?: string,
): string {
  const merged = documents(resolved.source);
  const target = dependencyDocument(merged).doc;
  const initial = target.toJS() as LockGraph & Record<string, unknown>;
  const original = dependencyDocument(documents(api.source)).doc.toJS() as LockGraph &
    Record<string, unknown>;
  const incomingDocs = documents(rewriteImporters(api.source, "api"));
  const incoming = dependencyDocument(incomingDocs).doc.toJS() as LockGraph &
    Record<string, unknown>;
  const fail = (key: string): never => {
    throw new CreateError(
      `프론트 잠금 파일의 해석이 다르다(${resolved.app}, api): ${key}`,
      "같은 계약·패키지·도구 해석으로 잠금 파일을 맞추고 커밋한다.",
    );
  };
  optionalGraph(initial);
  optionalGraph(original);
  if (
    merged.length !== incomingDocs.length ||
    !isDeepStrictEqual(
      merged.slice(0, -1).map((d) => d.toJS() as unknown),
      incomingDocs.slice(0, -1).map((d) => d.toJS() as unknown),
    )
  )
    fail("도구 설치 문서");
  for (const key of new Set([...Object.keys(initial), ...Object.keys(incoming)])) {
    if (["importers", "packages", "snapshots"].includes(key)) continue;
    if (key === "overrides" && derivedTypeScriptOverride(original, initial, expectedTypeScript))
      continue;
    if (!isDeepStrictEqual(initial[key], incoming[key])) fail(key);
  }
  for (const section of ["importers", "packages", "snapshots"] as const) {
    for (const [key, value] of Object.entries(incoming[section])) {
      const current = initial[section][key];
      if (Object.hasOwn(initial[section], key)) {
        const equal =
          section === "snapshots"
            ? isDeepStrictEqual(withoutOptional(current), withoutOptional(value))
            : isDeepStrictEqual(current, value);
        if (!equal) fail(`${section}.${key}`);
      } else initial[section][key] = value;
    }
  }
  applyOptionalGraph(initial);
  for (const section of ["importers", "packages", "snapshots"])
    target.set(section, initial[section]);
  return merged.map((doc) => doc.toString({ lineWidth: 0 })).join("\n");
}

function derivedTypeScriptOverride(
  before: LockGraph & Record<string, unknown>,
  after: LockGraph & Record<string, unknown>,
  expectedTypeScript?: string,
): boolean {
  const importer = before.importers["."] as
    | {
        dependencies?: { typescript?: { specifier?: string; version?: string } };
        devDependencies?: { typescript?: { specifier?: string; version?: string } };
      }
    | undefined;
  const originalTypeScript =
    importer?.devDependencies?.typescript ?? importer?.dependencies?.typescript;
  return (
    expectedTypeScript !== undefined &&
    !Object.hasOwn(before, "overrides") &&
    originalTypeScript?.specifier === expectedTypeScript &&
    originalTypeScript.version === expectedTypeScript &&
    isDeepStrictEqual(after.overrides, { typescript: expectedTypeScript })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function derivedTypeScriptPeer(before: unknown, after: unknown, pin: string): boolean {
  if (!isRecord(before) || !isRecord(after) || !isRecord(before.peerDependencies)) return false;
  const peers = before.peerDependencies;
  return (
    Object.hasOwn(peers, "typescript") &&
    typeof peers.typescript === "string" &&
    peers.typescript !== pin &&
    isDeepStrictEqual(after, { ...before, peerDependencies: { ...peers, typescript: pin } })
  );
}

export function alignDerivedTypeScriptPeers(resolved: string, api: string, pin: string): string {
  const docs = documents(api);
  const { doc } = dependencyDocument(docs);
  const apiData = doc.toJS() as LockGraph & Record<string, unknown>;
  const resolvedData = dependencyDocument(documents(resolved)).doc.toJS() as LockGraph &
    Record<string, unknown>;
  if (!derivedTypeScriptOverride(apiData, resolvedData, pin)) return api;
  let changed = false;
  for (const [key, value] of Object.entries(apiData.packages)) {
    if (
      Object.hasOwn(resolvedData.packages, key) &&
      derivedTypeScriptPeer(value, resolvedData.packages[key], pin)
    ) {
      doc.setIn(["packages", key, "peerDependencies", "typescript"], pin);
      changed = true;
    }
  }
  return changed ? docs.map((item) => item.toString({ lineWidth: 0 })).join("\n") : api;
}

export function verifyAppResolutions(
  original: string,
  combined: string,
  app: string,
  expectedTypeScript?: string,
): void {
  if (app !== "api") {
    verifyFrontendResolutions(original, combined, app);
    return;
  }
  const originalDocs = documents(original),
    combinedDocs = documents(combined);
  const before = dependencyDocument(originalDocs).doc.toJS() as LockGraph & Record<string, unknown>;
  const after = dependencyDocument(combinedDocs).doc.toJS() as LockGraph & Record<string, unknown>;
  const fail = (key: string): never => {
    throw new CreateError(
      `${app}: ${key}: 해석 결과가 바뀌었다`,
      "앱 잠금 파일의 의존성 해석을 보존한다.",
    );
  };
  if (
    !isDeepStrictEqual(
      originalDocs.slice(0, -1).map((d) => d.toJS() as unknown),
      combinedDocs.slice(0, -1).map((d) => d.toJS() as unknown),
    )
  )
    fail("도구 설치 문서");
  const derivedOverride = derivedTypeScriptOverride(before, after, expectedTypeScript);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (["importers", "packages", "snapshots"].includes(key)) continue;
    if (key === "overrides" && derivedOverride) continue;
    if (!isDeepStrictEqual(before[key], after[key])) fail(`metadata.${key}`);
  }
  optionalGraph(before);
  optionalGraph(after);
  for (const [path, importer] of Object.entries(before.importers)) {
    if (!isDeepStrictEqual(importer, after.importers[path === "." ? `apps/${app}` : path]))
      fail(`${path} importer`);
  }
  for (const [key, value] of Object.entries(before.packages)) {
    if (
      !Object.hasOwn(after.packages, key) ||
      !(
        isDeepStrictEqual(value, after.packages[key]) ||
        (derivedOverride &&
          expectedTypeScript !== undefined &&
          derivedTypeScriptPeer(value, after.packages[key], expectedTypeScript))
      )
    )
      fail(key);
  }
  for (const [key, value] of Object.entries(before.snapshots)) {
    if (
      !Object.hasOwn(after.snapshots, key) ||
      !isDeepStrictEqual(withoutOptional(value), withoutOptional(after.snapshots[key]))
    )
      fail(key);
  }
}
