import { execFileSync } from "node:child_process";
import {
  childEnvironment,
  isMain,
  protectedFile,
  readInput,
  relativeFile,
  writeOutput,
} from "./common.mjs";

function committed(root, file) {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:./${file}`], {
      cwd: root,
      stdio: "ignore",
      env: childEnvironment(),
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}
function fileReason(root, raw, edit) {
  if (protectedFile(raw.replaceAll("\\", "/")))
    return ".env는 읽거나 쓰지 않는다. 공개 키는 .env.example에서 확인한다";
  const file = relativeFile(root, raw);
  if (!file || !edit) return undefined;
  if (file.startsWith("src/generated/")) return "생성물은 직접 고치지 않는다. pnpm gen을 실행한다";
  if (file === "openapi.json") return "openapi.json은 pnpm gen으로 만든다";
  if (/^prisma\/migrations\/.+\/migration\.sql$/.test(file) && committed(root, file))
    return "커밋된 마이그레이션은 수정·삭제하지 않는다. 새 pnpm db:revision을 만든다";
  return undefined;
}
function commandReason(root, raw) {
  // 감싼 Bash/PowerShell 명령도 전체 단어열에서 검사한다. 셸을 실행하지 않는다.
  const command = raw.replaceAll("\\", "/");
  if (/\b(?:npx|pnpx|bunx)\b|\b(?:pnpm|yarn)\s+dlx\b|\bnpm\s+exec\b/i.test(command))
    return "고정한 로컬 CLI를 pnpm exec으로 실행한다";
  if (/\bprisma\s+db\s+push\b/i.test(command))
    return "prisma db push 대신 pnpm db:revision과 pnpm db:migrate를 쓴다";
  if (/\bprisma\s+migrate\s+reset\b/i.test(command))
    return "소유·로컬 검사를 하는 pnpm db:reset을 쓴다";
  if (/--accept-data-loss\b/i.test(command))
    return "데이터 손실 옵션 대신 검토한 마이그레이션을 쓴다";
  if (
    /\b(?:LEFTHOOK|HUSKY)\s*=\s*["']?(?:0|false)\b|\bHUSKY_SKIP_HOOKS\s*=\s*["']?(?:1|true)\b/i.test(
      command,
    )
  )
    return "git hook을 건너뛰거나 끄지 않는다. 실패한 검사를 고친다";
  for (const [git] of command.matchAll(/\bgit\b[^;&|\n]*/gi)) {
    if (
      /core\.hooksPath|--no-verify\b/i.test(git) ||
      (/\bcommit\b/i.test(git) && /(?:^|\s)-[a-z]*n[a-z]*(?=\s|$|["'])/i.test(git))
    )
      return "git hook을 건너뛰거나 끄지 않는다. 실패한 검사를 고친다";
    if (
      /\bpush\b/i.test(git) &&
      /--force(?:-with-lease)?\b|(?:^|\s)-[a-z]*f[a-z]*(?=\s|$|["'])|(?:^|\s)\+[^\s]+/i.test(git)
    )
      return "git push force 옵션 대신 일반 push를 쓴다";
  }
  for (const match of command.matchAll(/postgres(?:ql)?:\/\/[^\s'";]+/gi)) {
    try {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(match[0]).hostname))
        return "원격 DB 명령은 막는다. 로컬 DB와 pnpm db 명령을 쓴다";
    } catch {
      return "DB 주소를 확인할 수 없다. 로컬 DB와 pnpm db 명령을 쓴다";
    }
  }
  const tokens = command.match(/[^\s'";|&<>()]+/g) ?? [];
  if (tokens.some(protectedFile)) return ".env를 셸로 읽거나 쓰지 않는다. .env.example을 확인한다";
  const editing =
    /\b(?:rm|del|remove-item|mv|move-item|sed|perl|tee|set-content|out-file)\b|>>?|\b(?:cp|copy-item)\b/i.test(
      command,
    );
  if (editing)
    for (const token of tokens) {
      const reason = fileReason(root, token, true);
      if (reason) return reason;
    }
  return undefined;
}
/** @param {import('./pre-tool-use.mjs').HookInput} input */
export function preToolUseDecision(input) {
  const { tool_name, tool_input, cwd } = input;
  const reason = ["Bash", "PowerShell"].includes(tool_name)
    ? commandReason(cwd, String(tool_input.command ?? ""))
    : fileReason(
        cwd,
        String(tool_input.file_path ?? tool_input.path ?? ""),
        ["Edit", "Write", "MultiEdit"].includes(tool_name),
      );
  if (reason) return { decision: "deny", reason };
  return { decision: "allow" };
}
if (isMain(import.meta.url)) {
  const result = preToolUseDecision(readInput());
  if (result.decision === "deny")
    writeOutput({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: result.reason,
      },
    });
}
