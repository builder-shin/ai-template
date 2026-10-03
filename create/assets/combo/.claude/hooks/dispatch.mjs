import { readFileSync } from "node:fs";
import { relative, resolve, join, sep } from "node:path";
import { run, exitCode, gitEnvironment, isGitRoot, pnpmEntry } from "../../scripts/process.mjs";
import { checkRoot } from "../../scripts/check.mjs";
import { formatFile } from "../../scripts/staged-format.mjs";

const apps = ["api", "web"];
const label = (app, text) => `[${app}]\n${text}`;
const details = (result) =>
  [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n").trim();
const withHint = (message, hint) => (message.includes("—") ? message : `${message} — ${hint}`);
const context = (event, text) => ({
  hookSpecificOutput: { hookEventName: event, additionalContext: text },
});

function localPath(root, path, cwd = root) {
  if (typeof path !== "string") return undefined;
  const local = relative(root, resolve(cwd, path)).split(sep).join("/");
  return !local || local === ".." || local.startsWith("../") || /^[A-Za-z]:/.test(local)
    ? undefined
    : local;
}

function changedFiles(root, execute) {
  const result = execute("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    env: gitEnvironment(),
  });
  if (exitCode(result))
    throw new Error(details(result) || "변경 파일을 확인할 수 없다 — git 저장소에서 실행한다.");
  const fields = result.stdout.split("\0");
  const files = [];
  for (let i = 0; i < fields.length; i++) {
    const record = fields[i];
    if (!record) continue;
    files.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) files.push(fields[++i]);
  }
  return files.filter(Boolean);
}

function appHooks(root, app, event, input, raw, execute) {
  const cwd = join(root, "apps", app);
  const settings = JSON.parse(readFileSync(join(cwd, ".claude/settings.json"), "utf8"));
  const match = event === "SessionStart" ? input.source : input.tool_name;
  const results = [];
  const env = { ...gitEnvironment(), CLAUDE_PROJECT_DIR: cwd, PYTHONUTF8: "1" };
  try {
    env.npm_execpath = pnpmEntry(env);
  } catch {
    // pnpm이 없어도 순수 정책 hook은 돈다. 필요한 앱 hook이 설치 안내를 맡는다.
  }
  for (const group of settings.hooks?.[event] ?? []) {
    if (
      group.matcher &&
      group.matcher !== "*" &&
      !new RegExp(`^(?:${group.matcher})$`).test(match ?? "")
    )
      continue;
    for (const hook of group.hooks) {
      if (hook.type !== "command" || !Array.isArray(hook.args))
        throw new Error("앱 hook 형식이 틀렸다 — command와 args의 exec form으로 저장한다.");
      const expand = (value) => value.replaceAll("${CLAUDE_PROJECT_DIR}", cwd);
      results.push({
        app,
        command: expand(hook.command),
        ...execute(expand(hook.command), hook.args.map(expand), {
          cwd,
          env,
          input: raw,
          timeout: (hook.timeout ?? 600) * 1000,
          maxBuffer: 16 * 1024 * 1024,
        }),
      });
    }
  }
  return results;
}

function merge(event, results) {
  const blocks = [];
  const contexts = [];
  const errors = [];
  const decisions = [];
  for (const result of results) {
    if (result.error) {
      errors.push(
        label(
          result.app,
          withHint(
            details(result),
            result.error.code === "ETIMEDOUT"
              ? "앱 hook의 실행 시간과 timeout 설정을 확인하고 다시 실행한다."
              : `${result.command ?? "앱 hook 도구"}를 설치하고 PATH에 추가한 뒤 pnpm setup을 실행한다.`,
          ),
        ),
      );
      continue;
    }
    let json;
    const stdout = String(result.stdout ?? "").trim();
    if (stdout.startsWith("{") && stdout.endsWith("}")) {
      try {
        json = JSON.parse(stdout);
      } catch {
        errors.push(label(result.app, "hook JSON을 읽을 수 없다 — JSON 객체 하나를 출력한다."));
      }
    }
    const specific = json?.hookSpecificOutput;
    const denied = specific?.permissionDecision === "deny" || json?.decision === "block";
    const reason = specific?.permissionDecisionReason ?? json?.reason;
    const blocked = exitCode(result) === 2 || denied;
    if (blocked) {
      blocks.push(
        label(
          result.app,
          (denied && reason) ||
            result.stderr?.trim() ||
            "hook이 실패했다 — 앱의 hook 출력을 확인한다.",
        ),
      );
    } else if (
      event === "PreToolUse" &&
      ["defer", "ask", "allow"].includes(specific?.permissionDecision)
    ) {
      decisions.push({
        decision: specific.permissionDecision,
        reason: label(result.app, reason ?? ""),
      });
    }
    if (specific?.additionalContext) contexts.push(label(result.app, specific.additionalContext));
    else if (!json && stdout && event === "SessionStart") contexts.push(label(result.app, stdout));
    if (!blocked && exitCode(result) !== 0 && !json)
      errors.push(label(result.app, details(result)));
  }
  if (event === "SessionStart")
    return { code: 0, json: context(event, [...contexts, ...blocks, ...errors].join("\n\n")) };
  if (event === "PreToolUse") {
    const decision = blocks.length
      ? "deny"
      : ["defer", "ask", "allow"].find((value) =>
          decisions.some((item) => item.decision === value),
        );
    if (decision || contexts.length)
      return {
        code: 0,
        json: {
          hookSpecificOutput: {
            hookEventName: event,
            ...(decision
              ? {
                  permissionDecision: decision,
                  permissionDecisionReason: blocks.length
                    ? [...blocks, ...errors].join("\n\n")
                    : decisions
                        .filter((item) => item.decision === decision)
                        .map((item) => item.reason)
                        .join("\n\n"),
                }
              : {}),
            ...(contexts.length ? { additionalContext: contexts.join("\n\n") } : {}),
          },
        },
        ...(!blocks.length && errors.length ? { stderr: errors.join("\n\n") } : {}),
      };
  }
  if (blocks.length)
    return {
      code: 0,
      json: {
        decision: "block",
        reason: [...blocks, ...errors].join("\n\n"),
        ...(contexts.length ? context(event, contexts.join("\n\n")) : {}),
      },
    };
  if (contexts.length)
    return {
      code: 0,
      json: context(event, contexts.join("\n\n")),
      ...(errors.length ? { stderr: errors.join("\n\n") } : {}),
    };
  return { code: errors.length ? 1 : 0, stderr: errors.join("\n\n") || undefined };
}

export function dispatch(
  event,
  raw,
  { root, run: execute = run, rootCheck = checkRoot, rootFormat = formatFile } = {},
) {
  try {
    const input = JSON.parse(raw);
    root = resolve(root ?? process.env.CLAUDE_PROJECT_DIR ?? input.cwd);
    if (event === "Stop" && input.stop_hook_active === true) return { code: 0 };
    let selected = apps;
    const results = [];
    if (event === "PostToolUse") {
      const path = localPath(root, input.tool_input?.file_path, input.cwd ?? root);
      selected = apps.filter((app) => path?.startsWith(`apps/${app}/`));
      if (path && !selected.length) results.push({ app: "root", ...rootFormat(root, path) });
    } else if (event === "Stop") {
      if (!isGitRoot(root, execute))
        return {
          code: 0,
          stderr:
            "루트가 git 최상위가 아니므로 Stop 검사를 건너뛴다 — 루트에서 git init 후 다시 실행한다.",
        };
      const files = changedFiles(root, execute);
      selected = apps.filter((app) => files.some((path) => path.startsWith(`apps/${app}/`)));
      if (files.some((path) => !path.startsWith("apps/"))) {
        const result = rootCheck(root);
        results.push({
          app: "root",
          ...result,
          ...(exitCode(result) ? { status: 2, stderr: details(result) } : {}),
        });
      }
    }
    for (const app of selected) {
      try {
        results.push(...appHooks(root, app, event, input, raw, execute));
      } catch (error) {
        results.push({
          app,
          status: 2,
          stderr: withHint(error.message, "앱 hook 설정과 도구 설치를 확인한다."),
        });
      }
    }
    return merge(event, results);
  } catch (error) {
    return merge(event, [
      {
        app: "root",
        status: 2,
        stderr: withHint(error.message, "hook 입력과 git 상태를 확인한다."),
      },
    ]);
  }
}

export function main(event) {
  const result = dispatch(event, readFileSync(0, "utf8"));
  if (result.json) console.log(JSON.stringify(result.json));
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.code;
}
