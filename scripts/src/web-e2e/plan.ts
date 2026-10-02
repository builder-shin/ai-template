import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const COMPOSE_FILE = "scripts/compose/nextjs-e2e-fastapi.yaml";
export const URLS = {
  web: "http://localhost:3100",
  api: "http://127.0.0.1:18100",
  s3: "http://127.0.0.1:28433",
  mail: "http://127.0.0.1:28125",
  oauth: "http://127.0.0.1:28180",
} as const;

export function projectName(runId: string): string {
  if (["fastapi", "joon"].includes(runId) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)) {
    throw new Error("실행 ID는 보호 이름을 피하고 영문 소문자·숫자·하이픈 1~40자로 적는다.");
  }
  return `ai-template-web-e2e-${runId}`;
}

export function createPlan(runId: string, root = ROOT) {
  const project = projectName(runId);
  const base = ["docker", "compose", "-p", project, "-f", COMPOSE_FILE];
  return {
    root,
    runId,
    project,
    composeFile: COMPOSE_FILE,
    env: { WEB_E2E_RUN_ID: runId, COMPOSE_DISABLE_ENV_FILE: "1" },
    webEnv: {
      E2E_TARGET: "fastapi",
      APP_URL: URLS.web,
      API_BASE_URL: `${URLS.api}/api/v1`,
      NEXT_PUBLIC_REALTIME_URL: URLS.api,
      E2E_MAILPIT_URL: URLS.mail,
      E2E_OAUTH_URL: URLS.oauth,
      E2E_RECENT_LOGIN_SECONDS: "10",
    },
    ports: [
      { host: "localhost", port: 3100 },
      { host: "127.0.0.1", port: 18100 },
      { host: "127.0.0.1", port: 28433 },
      { host: "127.0.0.1", port: 28125 },
      { host: "127.0.0.1", port: 28180 },
    ],
    commands: {
      config: [...base, "config", "--quiet"],
      containers: [...base, "ps", "-a", "-q"],
      volumes: [
        "docker",
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project}`,
      ],
      up: [...base, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
      worker: [...base, "ps", "--status", "running", "--services", "worker"],
      ps: [...base, "ps", "--all"],
      logs: [...base, "logs", "--no-color", "--tail", "100"],
      down: [...base, "down", "--volumes", "--remove-orphans"],
      image: ["docker", "image", "ls", "-q", `ai-template-web-e2e-fastapi:${runId}`],
      removeImage: ["docker", "image", "rm", `ai-template-web-e2e-fastapi:${runId}`],
    },
  };
}

export type Plan = ReturnType<typeof createPlan>;

export function webCommand(plan: Plan, pnpm = process.env.npm_execpath): string[] {
  if (!pnpm) throw new Error("pnpm web-e2e로 실행한다.");
  const launcher = /\.(?:c?js|mjs)$/i.test(pnpm) ? [process.execPath, pnpm] : [pnpm];
  return [...launcher, "--dir", resolve(plan.root, "templates/nextjs"), "test:e2e"];
}
