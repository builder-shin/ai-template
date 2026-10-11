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
  const config = JSON.parse(readFileSync(join(root, "apps", app, "app.config.json"), "utf8"));
  const port = config.ports?.e2e;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      `E2E 포트 설정이 올바르지 않다: ${app} — app.config.json의 ports.e2e를 확인한다.`,
    );
  return `http://localhost:${port}`;
}
