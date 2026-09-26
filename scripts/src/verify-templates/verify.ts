import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkAgentsMd } from "../agents-md/check.ts";
import { diffDirs, listFiles } from "./files.ts";
import {
  isRecord,
  readTemplateManifest,
  requiredCommands,
  type SharedAssetsManifest,
  type TemplateManifest,
} from "./manifest.ts";

export const REQUIRED_HOOKS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

/** runner가 선언한 명령 이름. 아직 검사 방법이 없는 runner면 undefined. */
function declaredCommands(dir: string, manifest: TemplateManifest): Set<string> | undefined {
  if (manifest.runner !== "pnpm") return undefined;
  const path = join(dir, "package.json");
  if (!existsSync(path)) return new Set();
  const pkg: unknown = JSON.parse(readFileSync(path, "utf8"));
  const scripts = isRecord(pkg) && isRecord(pkg.scripts) ? pkg.scripts : {};
  return new Set(Object.keys(scripts));
}

function commandProblems(dir: string, manifest: TemplateManifest): string[] {
  const declared = declaredCommands(dir, manifest);
  if (declared === undefined) {
    return [
      `runner "${manifest.runner}"의 명령 검사는 아직 없다. 해당 템플릿 사이클에서 구현한다.`,
    ];
  }
  return requiredCommands(manifest)
    .filter((command) => !declared.has(command))
    .map((command) => `명령 "${command}"가 없다(docs/harness/standard.md의 명령 어휘).`);
}

/** 필수 hook 이벤트마다 exec form(command + args) hook이 하나 이상 있어야 한다. */
function hookProblems(dir: string): string[] {
  const path = join(dir, ".claude", "settings.json");
  if (!existsSync(path)) return [".claude/settings.json이 없다."];
  const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
  const hooks = isRecord(settings) && isRecord(settings.hooks) ? settings.hooks : {};
  return REQUIRED_HOOKS.filter((event) => {
    const groups = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    return !groups.some((group) => {
      const entries =
        isRecord(group) && Array.isArray(group.hooks) ? (group.hooks as unknown[]) : [];
      return entries.some(
        (entry) => isRecord(entry) && entry.type === "command" && Array.isArray(entry.args),
      );
    });
  }).map((event) => `${event} hook이 없거나 exec form(command + args)이 아니다.`);
}

function requiredFileProblems(dir: string, manifest: TemplateManifest): string[] {
  const problems: string[] = [];
  if (!existsSync(join(dir, ".env.example"))) problems.push(".env.example이 없다.");
  const recipes = listFiles(join(dir, "docs", "recipes")).filter((file) => file.endsWith(".md"));
  if (recipes.length === 0) problems.push("docs/recipes/에 레시피(.md)가 하나도 없다.");
  const golden = join(dir, manifest.goldenModule);
  if (!existsSync(golden) || !statSync(golden).isDirectory()) {
    problems.push(`골든 모듈 ${manifest.goldenModule}이 없다.`);
  }
  return problems;
}

function sharedAssetProblems(
  repoRoot: string,
  templateName: string,
  shared: SharedAssetsManifest,
): string[] {
  return shared.assets.flatMap((asset) =>
    asset.targets
      .filter((target) => target.template === templateName)
      .flatMap((target) => {
        const copy = join(repoRoot, "templates", templateName, target.path);
        const changed = diffDirs(join(repoRoot, asset.source), copy);
        return changed.length === 0
          ? []
          : [
              `${target.path}가 원본 ${asset.source}와 다르다(${changed.join(", ")}). pnpm sync를 돌린다.`,
            ];
      }),
  );
}

/** 템플릿 하나를 하네스 표준으로 검사한다. */
export function verifyTemplate(
  repoRoot: string,
  templateName: string,
  shared: SharedAssetsManifest,
): string[] {
  const dir = join(repoRoot, "templates", templateName);
  const manifest = readTemplateManifest(dir);
  if (Array.isArray(manifest)) return manifest;
  return [
    ...checkAgentsMd(dir).map((problem) => `${problem.path}: ${problem.message}`),
    ...commandProblems(dir, manifest),
    ...hookProblems(dir),
    ...requiredFileProblems(dir, manifest),
    ...sharedAssetProblems(repoRoot, templateName, shared),
  ];
}
