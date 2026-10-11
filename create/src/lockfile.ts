import { isDeepStrictEqual } from "node:util";
import { isMap, parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";

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
