import { resolve } from "node:path";
import { backendOf } from "./setup.mjs";
import { exitCode, isMain, run } from "./process.mjs";

export function frontendEnvironment(app, source) {
  for (const key of [
    "E2E_API_URL",
    "E2E_WEB_URL",
    "E2E_MAILPIT_URL",
    "E2E_RECENT_LOGIN_SECONDS",
    ...(app === "web" ? ["E2E_OAUTH_URL"] : []),
    ...(app === "admin" ? ["E2E_SEED_ADMIN_EMAIL", "E2E_SEED_ADMIN_PASSWORD"] : []),
  ]) {
    if (!source[key]?.trim()) throw new Error(`${key} 설정이 없다 — api e2e:serve로 실행한다.`);
  }
  return {
    ...source,
    E2E_TARGET: source.E2E_TARGET ?? "fastapi",
    APP_URL: source.E2E_WEB_URL,
    API_BASE_URL: `${source.E2E_API_URL.replace(/\/$/, "")}/api/v1`,
    NEXT_PUBLIC_REALTIME_URL: source.E2E_API_URL,
  };
}

export function frontendE2e(root, app, source = process.env, execute = run) {
  return exitCode(
    execute("pnpm", ["--filter", app, "run", "test:e2e"], {
      cwd: root,
      env: frontendEnvironment(app, source),
      stdio: "inherit",
    }),
  );
}

if (isMain(import.meta.url)) {
  try {
    const app = process.argv[2];
    if (!app) throw new Error("프론트 앱 이름이 없다 — api e2e:serve에서 앱 이름을 전달한다.");
    const root = resolve(import.meta.dirname, "..");
    process.exitCode = frontendE2e(root, app, {
      ...process.env,
      E2E_TARGET: backendOf(resolve(root, "apps/api")),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
