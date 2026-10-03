import { isDeepStrictEqual } from "node:util";
import { isMap, parseAllDocuments } from "yaml";
import { CreateError } from "./errors.ts";

function documents(source: string) {
  const docs = parseAllDocuments(source);
  if (docs.some((doc) => doc.errors.length > 0))
    throw new CreateError("잠금 파일이 올바르지 않다", "web 잠금 파일을 pnpm으로 다시 만든다.");
  return docs;
}

function dependencyDocument(source: string) {
  const docs = documents(source);
  // pnpm 12는 도구 설치 잠금과 프로젝트 의존성을 별도 YAML 문서로 저장한다.
  const doc = docs.at(-1);
  if (!doc || !isMap(doc.get("importers", true)))
    throw new CreateError(
      "잠금 파일에 importer가 없다",
      "web에서 pnpm install로 잠금 파일을 만든다.",
    );
  return doc;
}

export function rewriteImporters(source: string): string {
  const docs = documents(source);
  const doc = dependencyDocument(source);
  const importers = doc.get("importers", true);
  if (!isMap(importers)) throw new Error("importer가 없다");
  for (const pair of importers.items) {
    const path = String(pair.key);
    if (path !== "." && !path.startsWith("contract/"))
      throw new CreateError(
        "web importer 경로가 올바르지 않다",
        "web workspace의 contract 패키지를 확인한다.",
      );
    pair.key = doc.createNode(path === "." ? "apps/web" : `apps/web/${path}`);
  }
  docs[docs.length - 1] = doc;
  return docs
    .map((item) => {
      item.directives.docStart = true;
      return item.toString({ lineWidth: 0 });
    })
    .join("\n");
}

export function verifyWebResolutions(original: string, combined: string): void {
  const before = dependencyDocument(original).toJS() as Record<string, Record<string, unknown>>;
  const after = dependencyDocument(combined).toJS() as Record<string, Record<string, unknown>>;
  for (const [path, importer] of Object.entries(before.importers ?? {})) {
    const moved = path === "." ? "apps/web" : `apps/web/${path}`;
    if (!isDeepStrictEqual(importer, after.importers?.[moved]))
      throw new CreateError(
        `${path} importer의 해석 결과가 바뀌었다`,
        "web 잠금 파일의 버전을 보존해 다시 생성한다.",
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
          `${key}의 해석 결과가 바뀌었다`,
          "web 잠금 파일의 의존성 해석을 보존한다.",
        );
    }
  }
}
