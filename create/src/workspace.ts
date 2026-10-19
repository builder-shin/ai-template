import { isDeepStrictEqual } from "node:util";
import { parseDocument } from "yaml";
import { CreateError } from "./errors.ts";

export interface WorkspaceDocument {
  packages?: string[];
  minimumReleaseAge?: number;
  allowBuilds?: Record<string, boolean>;
  overrides?: Record<string, string>;
  [key: string]: unknown;
}
interface WorkspaceInput {
  frontends: readonly WorkspaceDocument[];
  api?: WorkspaceDocument;
  includeApi?: boolean;
}

function validateWorkspaceKeys(document: WorkspaceDocument): void {
  for (const key of Object.keys(document))
    if (!["packages", "minimumReleaseAge", "allowBuilds", "overrides"].includes(key))
      throw new CreateError(
        `지원하지 않는 workspace 설정이다: ${key}`,
        "workspace 정책과 병합 규칙을 함께 검토한다.",
      );
}

export function mergeWorkspace(input: WorkspaceInput): WorkspaceDocument;
export function mergeWorkspace(
  sources: readonly { app: string; source: string }[],
  typescript: string,
): string;
export function mergeWorkspace(
  input: WorkspaceInput | readonly { app: string; source: string }[],
  typescript?: string,
): WorkspaceDocument | string {
  if (Array.isArray(input)) {
    if (typescript === undefined)
      throw new CreateError("TypeScript pin이 없다", "프론트의 고정 버전을 지정한다.");
    return mergeLegacyWorkspace(input, typescript);
  }
  const { frontends, api, includeApi = true } = input as WorkspaceInput;
  for (const document of [...frontends, ...(api ? [api] : [])]) validateWorkspaceKeys(document);
  const first = frontends[0];
  if (!first) throw new CreateError("프론트 workspace가 없다", "프론트 앱을 하나 이상 지정한다.");
  const result = structuredClone(first);
  const fail = (key: string): never => {
    throw new CreateError(
      `workspace 설정이 다르다: ${key}`,
      "workspace 정책과 잠금 파일을 맞추고 커밋한다.",
    );
  };
  for (const next of frontends.slice(1))
    for (const key of ["minimumReleaseAge", "allowBuilds", "overrides"])
      if (!isDeepStrictEqual(first[key], next[key])) fail(key);
  if (api && includeApi) {
    for (const key of ["minimumReleaseAge", "overrides"])
      if (!isDeepStrictEqual(first[key], api[key])) fail(key);
    result.allowBuilds = { ...first.allowBuilds };
    for (const [key, value] of Object.entries(api.allowBuilds ?? {})) {
      if (Object.hasOwn(result.allowBuilds, key) && result.allowBuilds[key] !== value)
        fail(`allowBuilds.${key}`);
      result.allowBuilds[key] = value;
    }
  }
  result.packages = [
    ...new Set([
      ...(includeApi ? ["apps/api"] : []),
      ...frontends
        .flatMap((doc) => doc.packages ?? [])
        .filter((path) => path !== "apps/api" && path !== "contract/*"),
      "contract/*",
    ]),
  ];
  return result;
}

function mergeLegacyWorkspace(
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
    validateWorkspaceKeys(doc.toJS() as WorkspaceDocument);
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
