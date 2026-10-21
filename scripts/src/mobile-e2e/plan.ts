import { resolve } from "node:path";
export type Backend = "fastapi" | "nestjs";
export const ROOT = resolve(import.meta.dirname, "../../..");
export const MOBILE_URLS = {
  api: "http://127.0.0.1:18102",
  s3: "http://127.0.0.1:28435",
  mail: "http://127.0.0.1:28127",
  oauth: "http://127.0.0.1:28182",
};
export function createMobilePlan(backend: Backend, runId: string) {
  if (
    !["fastapi", "nestjs"].includes(backend) ||
    !["fastapi", "joon", "nestjs"].every((value) => value !== runId) ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(runId)
  )
    throw new Error(
      "Use a supported native backend and an unprotected run ID (1–40 lowercase letters, digits, hyphens).",
    );
  const project = `ai-template-mobile-${backend}-e2e-${runId}`,
    image = `ai-template-mobile-e2e-${backend}:${runId}`,
    composeFile = `scripts/compose/expo-e2e-${backend}.yaml`,
    base = ["docker", "compose", "-p", project, "-f", composeFile];
  return {
    backend,
    runId,
    root: ROOT,
    project,
    image,
    composeFile,
    urls: MOBILE_URLS,
    env: { MOBILE_E2E_RUN_ID: runId, COMPOSE_DISABLE_ENV_FILE: "1" },
    ports: Object.values(MOBILE_URLS).map((value) => ({
      host: "127.0.0.1",
      port: Number(new URL(value).port),
    })),
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
      up: [...base, "up", "-d", "--build", "--wait", "--wait-timeout", "240"],
      worker: [...base, "ps", "--status", "running", "--services", "worker"],
      ps: [...base, "ps", "--all"],
      logs: [...base, "logs", "--no-color", "--tail", "100"],
      down: [...base, "down", "--volumes", "--remove-orphans"],
      image: ["docker", "image", "ls", "-q", image],
      removeImage: ["docker", "image", "rm", image],
    },
  };
}
export type MobilePlan = ReturnType<typeof createMobilePlan>;
