import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function appNames(root) {
  const folder = join(root, "apps");
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(folder, entry.name, "package.json")))
    .map((entry) => entry.name)
    .sort((a, b) => (a === "api" ? -1 : b === "api" ? 1 : a.localeCompare(b)));
}

export function frontendNames(root) {
  return appNames(root).filter((app) => app !== "api");
}

export function e2eOrigin(root, app) {
  const file = `apps/${app}/app.config.json`;
  let config;
  try {
    config = JSON.parse(readFileSync(join(root, file), "utf8"));
  } catch (cause) {
    throw new Error(
      `${app}: ${file} 설정을 읽을 수 없다 — 파일을 유효한 JSON으로 복구하고 ports.e2e를 확인한다.`,
      { cause },
    );
  }
  const port = config?.ports?.e2e;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      `${app}: ${file} E2E 포트 설정이 올바르지 않다 — ports.e2e를 1~65535 정수로 설정한다.`,
    );
  return `http://localhost:${port}`;
}
