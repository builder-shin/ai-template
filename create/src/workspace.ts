import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";
import { CreateError } from "./errors.ts";

export function mergeWorkspace(
  sources: readonly { app: string; source: string }[],
  typescript: string,
): string {
  const first = sources[0];
  if (!first) throw new CreateError("프론트 workspace가 없다", "프론트 앱을 하나 이상 지정한다.");
  const document = (source: string) => {
    const doc = parseDocument(source);
    if (doc.errors.length)
      throw new CreateError(
        "프론트 workspace가 올바르지 않다",
        "pnpm-workspace.yaml의 YAML을 고치고 커밋한다.",
      );
    return doc;
  };
  const merged = document(first.source);
  for (const source of sources.slice(1)) {
    const next = document(source.source);
    for (const key of ["minimumReleaseAge", "allowBuilds", "overrides"]) {
      const left = (merged.toJS() as Record<string, unknown>)[key];
      const right = (next.toJS() as Record<string, unknown>)[key];
      if (!isDeepStrictEqual(left, right))
        throw new CreateError(
          `프론트 workspace 설정이 다르다: ${key} (${first.app}=${JSON.stringify(left)}, ${source.app}=${JSON.stringify(right)})`,
          "pnpm-workspace.yaml 설정과 잠금 파일을 맞추고 커밋한다.",
        );
    }
  }
  merged.set("packages", ["apps/api", ...sources.map(({ app }) => `apps/${app}`), "contract/*"]);
  // workspace 이동 뒤에도 계약 패키지의 TypeScript peer를 템플릿 버전으로 유지한다.
  merged.setIn(["overrides", "typescript"], typescript);
  return merged.toString();
}
