import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mockOrigin, webOrigin, targetName, targetEnvironment } from "../e2e/targets";
import { mockRecentLoginSeconds } from "../e2e/targets/mock";

export interface ServerDependencies {
  assertFree(origin: string): Promise<void>;
  ready(url: string, child?: ChildProcess): Promise<void>;
  start(args: string[], env: Record<string, string | undefined>, server?: boolean): ChildProcess;
  stopped(): boolean;
}

/** 외부 스택은 소유하지 않는다. 선택한 대상 준비 뒤 운영 web만 시작한다. */
export async function startE2eServers(
  env: Record<string, string | undefined>,
  deps: ServerDependencies,
) {
  const target = targetName(env.E2E_TARGET ?? "mock");
  const webEnv = { ...env, ...targetEnvironment(target, env) };
  const require = createRequire(import.meta.url);
  await deps.assertFree(webOrigin);
  if (target === "mock") {
    await deps.assertFree(mockOrigin);
    const mock = deps.start(
      ["--import", pathToFileURL(require.resolve("tsx")).href, "contract/mock/src/main.ts"],
      {
        ...webEnv,
        PORT: new URL(mockOrigin).port,
        HOST: new URL(mockOrigin).hostname,
        API_URL: mockOrigin,
        FRONTEND_URL: webOrigin,
        OAUTH_REDIRECT_URIS: `${webOrigin}/oauth/callback`,
        STORAGE_ALLOWED_ORIGINS: webOrigin,
        REALTIME_ALLOWED_ORIGINS: webOrigin,
        MOCK_TEST_ENDPOINTS: "true",
        RECENT_LOGIN_SECONDS: String(mockRecentLoginSeconds),
        IDENTIFIER_HASH_SECRET: randomBytes(32).toString("hex"),
        RATE_LIMIT_GLOBAL: "10000",
        RATE_LIMIT_REGISTRATION_IP: "1000",
        RATE_LIMIT_LOGIN_IP: "1000",
        RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
        RATE_LIMIT_MAIL_IP: "1000",
      },
    );
    await deps.ready(`${mockOrigin}/health/ready`, mock);
  } else {
    const api = new URL(webEnv.API_BASE_URL!);
    await deps.ready(`${api.origin}/health/ready`);
  }
  const next = require.resolve("next/dist/bin/next");
  const build = deps.start([next, "build"], webEnv, false);
  const [code] = await once(build, "exit");
  if (code !== 0 || deps.stopped()) throw new Error("E2E 운영 빌드에 실패했다.");
  const web = deps.start(
    [next, "start", "--hostname", "localhost", "--port", new URL(webOrigin).port],
    webEnv,
  );
  await deps.ready(webOrigin, web);
}
