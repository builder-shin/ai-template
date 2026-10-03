import { resolve } from "node:path";
import { exitCode, isMain, run } from "./process.mjs";

export function webEnvironment(source) {
  for (const key of [
    "E2E_API_URL",
    "E2E_WEB_URL",
    "E2E_MAILPIT_URL",
    "E2E_OAUTH_URL",
    "E2E_RECENT_LOGIN_SECONDS",
  ]) {
    if (!source[key]) throw new Error(`${key} 설정이 없다 — api e2e:serve로 실행한다.`);
  }
  return {
    ...source,
    E2E_TARGET: "fastapi",
    APP_URL: source.E2E_WEB_URL,
    API_BASE_URL: `${source.E2E_API_URL.replace(/\/$/, "")}/api/v1`,
    NEXT_PUBLIC_REALTIME_URL: source.E2E_API_URL,
  };
}

export function webE2e(root, source = process.env, execute = run) {
  return exitCode(
    execute("pnpm", ["--filter", "web", "run", "test:e2e"], {
      cwd: root,
      env: webEnvironment(source),
      stdio: "inherit",
    }),
  );
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = webE2e(resolve(import.meta.dirname, ".."));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
