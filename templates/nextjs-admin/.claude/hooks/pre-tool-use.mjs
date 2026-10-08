import { readInput, emit } from "./common.mjs";

/** 셸을 실행하지 않고 인용과 래퍼를 풀어 위험한 하위 명령도 검사한다. 최선의 검사다. */
export function denial(command) {
  const plain = command.replace(/["'`]/g, "").replace(/\\\r?\n/g, " ");
  const lower = plain.toLowerCase();
  if (
    /\bgit\b[^\n;|&]*\bpush\b[^\n;|&]*(?:--force\b|--force-with-lease\b|\s-[a-z]*f[a-z]*\b|\s\+\S)/.test(
      lower,
    )
  )
    return "강제 푸시 대신 일반 git push를 쓴다.";
  if (
    /--no-verify\b|core\.hookspath|\b(?:lefthook|husky)\s*=\s*(?:0|false)|lefthook_exclude|lefthook_disable/.test(
      lower,
    )
  )
    return "git hook을 켠 상태로 실행한다.";
  if (/\bgit\b[^\n;|&]*\b(?:clean\b|reset\s+--hard)/.test(lower))
    return "지울 파일을 확인한 뒤 파일별로 고친다.";
  const parts = plain.split(/\s+|[;|&<>]/).filter(Boolean);
  const secret = parts.some(
    (part) =>
      /(?:^|[\\/])\.env(?:\.[^\\/]*)?$/.test(part) && !/(?:^|[\\/])\.env\.example$/.test(part),
  );
  if (
    secret &&
    /\b(?:cat|type|head|tail|less|more|grep|rg|sed|awk|bat|get-content|gc|select-string)\b/i.test(
      plain,
    )
  )
    return ".env 대신 .env.example과 스키마를 읽는다.";
  if (
    /\b(?:rm|rmdir|rd|remove-item|del)\b/i.test(plain) &&
    parts.some((part) =>
      /^(?:(?:\.\.[\\/])+|[.]{1,2}[\\/]?|[\\/]|[A-Za-z]:[\\/]?|~[\\/]?|\$(?:\{?HOME\}?|env:USERPROFILE|env:HOME)|.*[*?].*)$/i.test(
        part,
      ),
    )
  )
    return "넓은 삭제 대신 프로젝트 안의 구체적인 파일 경로를 쓴다.";
  return undefined;
}

const input = readInput();
const reason = denial(String(input.tool_input?.command ?? ""));
if (reason)
  emit({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
