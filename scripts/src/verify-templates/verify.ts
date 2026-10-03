import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkAgentsMd } from "../agents-md/check.ts";
import { diffDirs, listFiles, sameFile } from "./files.ts";
import {
  isRecord,
  readTemplateManifest,
  requiredCommands,
  type SharedAssetsManifest,
  type TemplateManifest,
} from "./manifest.ts";
import { poeTasks } from "./poe.ts";

export const REQUIRED_HOOKS = ["PostToolUse", "Stop", "PreToolUse", "SessionStart"];

/**
 * runner가 선언한 명령 이름. pnpm은 package.json scripts, uv는 pyproject.toml의 [tool.poe.tasks]다.
 * 선언 파일을 읽지 못하면 문제 문장을 돌려준다.
 */
function declaredCommands(dir: string, manifest: TemplateManifest): Set<string> | string {
  if (manifest.runner === "uv") return poeTasks(dir);
  const path = join(dir, "package.json");
  if (!existsSync(path)) return new Set();
  const pkg: unknown = JSON.parse(readFileSync(path, "utf8"));
  const scripts = isRecord(pkg) && isRecord(pkg.scripts) ? pkg.scripts : {};
  return new Set(Object.keys(scripts));
}

function commandProblems(dir: string, manifest: TemplateManifest): string[] {
  const declared = declaredCommands(dir, manifest);
  if (typeof declared === "string") return [declared];
  return requiredCommands(manifest)
    .filter((command) => !declared.has(command))
    .map((command) => `명령 "${command}"가 없다(docs/harness/standard.md의 명령 어휘).`);
}

interface HookEntry {
  readonly event: string;
  /** settings.json 안의 위치. 예: hooks.Stop[0].hooks[1] */
  readonly where: string;
  readonly entry: Record<string, unknown>;
}

/** 모든 이벤트의 hook 항목을 위치와 함께 모은다. 형식이 틀린 부분은 건너뛴다. */
function hookEntries(hooks: Record<string, unknown>): HookEntry[] {
  return Object.entries(hooks).flatMap(([event, groups]) =>
    (Array.isArray(groups) ? (groups as unknown[]) : []).flatMap((group, i) => {
      const entries =
        isRecord(group) && Array.isArray(group.hooks) ? (group.hooks as unknown[]) : [];
      return entries.flatMap((entry, j) =>
        isRecord(entry)
          ? [{ event, where: `hooks.${event}[${String(i)}].hooks[${String(j)}]`, entry }]
          : [],
      );
    }),
  );
}

/**
 * 모든 command hook은 exec form(command + args)이어야 하고, 필수 이벤트마다 하나 이상 있어야 한다.
 * prompt 같은 다른 종류의 hook은 command hook이 아니므로 보지 않는다.
 */
function hookProblems(dir: string): string[] {
  const path = join(dir, ".claude", "settings.json");
  if (!existsSync(path)) return [".claude/settings.json이 없다."];
  const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
  const hooks = isRecord(settings) && isRecord(settings.hooks) ? settings.hooks : {};
  const commands = hookEntries(hooks).filter(({ entry }) => entry.type === "command");
  const missing = REQUIRED_HOOKS.filter(
    (event) => !commands.some((hook) => hook.event === event && Array.isArray(hook.entry.args)),
  ).map((event) => `${event} hook이 없거나 exec form(command + args)이 아니다.`);
  const shellForm = commands
    .filter(({ entry }) => !Array.isArray(entry.args))
    .map(
      ({ where }) =>
        `.claude/settings.json ${where}: 쉘 형식 hook이다. 실행 파일은 command에, 인자는 args 배열에 적는다(exec form).`,
    );
  return [...missing, ...shellForm];
}

function requiredFileProblems(dir: string, manifest: TemplateManifest): string[] {
  const problems: string[] = [];
  for (const file of [".github/workflows/ci.yml", ".gitattributes"]) {
    const path = join(dir, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${file}이 없다 — 템플릿 루트에 파일을 만든다.`);
    }
  }
  if (!existsSync(join(dir, ".env.example"))) problems.push(".env.example이 없다.");
  const recipes = listFiles(join(dir, "docs", "recipes")).filter((file) => file.endsWith(".md"));
  if (recipes.length === 0) problems.push("docs/recipes/에 레시피(.md)가 하나도 없다.");
  const golden = join(dir, manifest.goldenModule);
  if (!existsSync(golden) || !statSync(golden).isDirectory()) {
    problems.push(`골든 모듈 ${manifest.goldenModule}이 없다.`);
  }
  return problems;
}

/** 원본이 폴더면 파일마다, 파일 하나면 바이트 단위로 사본과 비교한다. */
function sharedAssetProblems(
  repoRoot: string,
  templateName: string,
  shared: SharedAssetsManifest,
): string[] {
  return shared.assets.flatMap((asset) =>
    asset.targets
      .filter((target) => target.template === templateName)
      .flatMap((target) => {
        const source = join(repoRoot, asset.source);
        const copy = join(repoRoot, "templates", templateName, target.path);
        const drift = `${target.path}가 원본 ${asset.source}와 다르다`;
        if (existsSync(source) && statSync(source).isFile()) {
          return sameFile(source, copy) ? [] : [`${drift}. pnpm sync를 돌린다.`];
        }
        const changed = diffDirs(source, copy);
        return changed.length === 0 ? [] : [`${drift}(${changed.join(", ")}). pnpm sync를 돌린다.`];
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
    ...checkAgentsMd(dir, { requireRoot: true }).map(
      (problem) => `${problem.path}: ${problem.message}`,
    ),
    ...commandProblems(dir, manifest),
    ...hookProblems(dir),
    ...requiredFileProblems(dir, manifest),
    ...sharedAssetProblems(repoRoot, templateName, shared),
  ];
}
