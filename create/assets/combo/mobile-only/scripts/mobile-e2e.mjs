import { run } from "./process.mjs";
import { mobileExit } from "./mobile-command.mjs";
export function mobileEnvironment(source) {
  for (const key of [
    "E2E_MOBILE_PLATFORM",
    "E2E_MOBILE_DEVICE",
    "E2E_MOBILE_BACKEND",
    "E2E_MOBILE_API_URL",
    "E2E_MOBILE_STORAGE_URL",
    "E2E_WEB_URL",
    "E2E_MAILPIT_URL",
    "E2E_OAUTH_URL",
  ])
    if (!source[key]?.trim())
      throw new Error(
        `${key} 설정이 없다 — 기기에서 닿는 API·메일·스토리지 주소로 native E2E 환경을 준비한다.`,
      );
  if (
    !["android", "ios"].includes(source.E2E_MOBILE_PLATFORM) ||
    !["fastapi", "nestjs"].includes(source.E2E_MOBILE_BACKEND) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(source.E2E_MOBILE_DEVICE)
  )
    throw new Error("Invalid explicit native platform/device/backend.");
  return {
    ...source,
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_API_MODE: "backend",
    E2E_UPSTREAM_API_URL: source.E2E_MOBILE_API_URL,
    E2E_STORAGE_UPSTREAM_URL: source.E2E_MOBILE_STORAGE_URL,
    EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:4112/api/v1",
    EXPO_PUBLIC_REALTIME_URL: "http://127.0.0.1:4112",
    EXPO_PUBLIC_FRONTEND_URL: source.E2E_WEB_URL,
  };
}
export function mobileE2e(root, source = process.env, execute = run) {
  const env = mobileEnvironment(source);
  return mobileExit(
    execute(
      "pnpm",
      [
        "--filter",
        "mobile",
        "run",
        "test:e2e",
        "--platform",
        source.E2E_MOBILE_PLATFORM,
        "--device",
        source.E2E_MOBILE_DEVICE,
        "--target",
        source.E2E_MOBILE_BACKEND,
        ...(source.E2E_MOBILE_RUN_ID ? ["--run-id", source.E2E_MOBILE_RUN_ID] : []),
      ],
      {
        cwd: root,
        stdio: "inherit",
        env,
      },
    ),
  );
}
