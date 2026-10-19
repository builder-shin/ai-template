import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { assertLocalDatabase } from "./guard.js";
const names = ["app", "app_test", "app_e2e"] as const;
export function databaseUrls(url: string): string[] {
  return names.map((name) => {
    const parsed = new URL(url);
    parsed.pathname = `/${name}`;
    return parsed.href;
  });
}
export function ensureDatabases(url: string): void {
  assertLocalDatabase(url, "setup");
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8" });
  const config = JSON.parse(docker("compose", "config", "--format", "json")) as { name?: string };
  const ids = docker("compose", "ps", "--all", "--quiet", "postgres")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length !== 1 || !ids[0]) throw new Error("postgres 컨테이너가 이 프로젝트 소유가 아니다");
  const id = ids[0];
  const inspected = JSON.parse(docker("inspect", id)) as {
    Config?: { Labels?: Record<string, string> };
  }[];
  const labels = inspected[0]?.Config?.Labels;
  if (
    !config.name ||
    labels?.["com.docker.compose.project"] !== config.name ||
    labels["com.docker.compose.service"] !== "postgres" ||
    !labels["com.docker.compose.project.working_dir"] ||
    realpathSync(labels["com.docker.compose.project.working_dir"]) !== realpathSync(process.cwd())
  )
    throw new Error("postgres 컨테이너가 이 프로젝트 소유가 아니다");
  const psql = (sql: string) =>
    docker(
      "exec",
      id,
      "psql",
      "--username",
      "app",
      "--dbname",
      "postgres",
      "--tuples-only",
      "--no-align",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      sql,
    );
  const existing = new Set(psql("SELECT datname FROM pg_database").trim().split(/\s+/));
  for (const name of names) if (!existing.has(name)) psql(`CREATE DATABASE "${name}"`);
}
