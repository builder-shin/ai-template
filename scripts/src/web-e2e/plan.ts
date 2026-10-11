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

export type App = "web" | "admin";
export const STACKS = {
  web: { composeFile: COMPOSE_FILE, runIdVariable: "WEB_E2E_RUN_ID", urls: URLS },
  admin: {
    composeFile: "scripts/compose/nextjs-admin-e2e-fastapi.yaml",
    runIdVariable: "ADMIN_E2E_RUN_ID",
    urls: {
      web: "http://localhost:3101",
      api: "http://127.0.0.1:18101",
      s3: "http://127.0.0.1:28434",
      mail: "http://127.0.0.1:28126",
      oauth: undefined,
    },
  },
} as const;
export const ADMIN_SEED = {
  email: "admin-e2e-admin@example.com",
  password: "admin-e2e-only-admin-password", // betterleaks:allow 전용 스택의 가짜 비밀번호
} as const;

export function projectName(runId: string, app: App = "web"): string {
  if (["fastapi", "joon"].includes(runId) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)) {
    throw new Error("실행 ID는 보호 이름을 피하고 영문 소문자·숫자·하이픈 1~40자로 적는다.");
  }
  return `ai-template-${app}-e2e-${runId}`;
}

export function createPlan(runId: string, root = ROOT, app: App = "web") {
  const project = projectName(runId, app);
  const { composeFile, runIdVariable, urls } = STACKS[app];
  const base = ["docker", "compose", "-p", project, "-f", composeFile];
  const image = `ai-template-${app}-e2e-fastapi:${runId}`;
  return {
    app,
    urls,
    runIdVariable,
    root,
    runId,
    project,
    composeFile,
    env: { [runIdVariable]: runId, COMPOSE_DISABLE_ENV_FILE: "1" },
    appEnv: {
      E2E_TARGET: "fastapi",
      APP_URL: urls.web,
      API_BASE_URL: `${urls.api}/api/v1`,
      NEXT_PUBLIC_REALTIME_URL: urls.api,
      E2E_MAILPIT_URL: urls.mail,
      ...(urls.oauth
        ? { E2E_OAUTH_URL: urls.oauth }
        : {
            E2E_SEED_ADMIN_EMAIL: ADMIN_SEED.email,
            E2E_SEED_ADMIN_PASSWORD: ADMIN_SEED.password,
          }),
      E2E_RECENT_LOGIN_SECONDS: "10",
    },
    ports: Object.values(urls)
      .filter((url) => url !== undefined)
      .map((value) => {
        const url = new URL(value);
        return { host: url.hostname, port: Number(url.port) };
      }),
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
      image: ["docker", "image", "ls", "-q", image],
      removeImage: ["docker", "image", "rm", image],
    },
  };
}

export type Plan = ReturnType<typeof createPlan>;

export function appCommand(plan: Plan, pnpm = process.env.npm_execpath): string[] {
  if (!pnpm) throw new Error(`pnpm ${plan.app}-e2e로 실행한다.`);
  const launcher = /\.(?:c?js|mjs)$/i.test(pnpm) ? [process.execPath, pnpm] : [pnpm];
  return [
    ...launcher,
    "--dir",
    resolve(plan.root, plan.app === "web" ? "templates/nextjs" : "templates/nextjs-admin"),
    "test:e2e",
  ];
}
