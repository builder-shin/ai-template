import { run } from "./process.mjs";
import { mobileExit } from "./mobile-command.mjs";
export function mobileEnvironment(source) {
  for (const key of ["E2E_MOBILE_API_URL", "E2E_WEB_URL", "E2E_MAILPIT_URL"])
    if (!source[key]?.trim())
      throw new Error(
        `${key} 설정이 없다 — 기기에서 닿는 API·메일·스토리지 주소로 native E2E 환경을 준비한다.`,
      );
  return {
    ...source,
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_MODE: "backend",
    EXPO_PUBLIC_API_BASE_URL: `${source.E2E_MOBILE_API_URL.replace(/\/$/, "")}/api/v1`,
    EXPO_PUBLIC_REALTIME_URL: source.E2E_MOBILE_API_URL,
    EXPO_PUBLIC_FRONTEND_URL: source.E2E_WEB_URL,
  };
}
export function mobileE2e(root, source = process.env, execute = run) {
  return mobileExit(
    execute("pnpm", ["--filter", "mobile", "run", "test:e2e"], {
      cwd: root,
      stdio: "inherit",
      env: mobileEnvironment(source),
    }),
  );
}
