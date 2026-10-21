import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ROOT } from "../../scripts/src/mobile-e2e/plan.ts";
import {
  createOwnedMobileProject,
  removeOwnedMobileProject,
} from "../../scripts/src/mobile-e2e/owned.ts";
import { runPnpm } from "../src/pnpm.ts";
import { parse, parseAllDocuments } from "yaml";

// Actual committed-input generation; API infrastructure is exercised only on the CI host.
if (process.env.CI !== "true")
  throw new Error("Run actual generated API setup/check in PR CI only.");
process.env.EXPO_NO_DOTENV = "1";
process.env.EXPO_PUBLIC_API_MODE = "backend";
process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com/api/v1";
process.env.EXPO_PUBLIC_REALTIME_URL = "https://api.example.com";
process.env.EXPO_PUBLIC_FRONTEND_URL = "https://app.example.com";
for (const scenario of ["standalone", "fastapi-mobile", "nestjs-all"] as const) {
  const backend = scenario === "nestjs-all" ? "nestjs" : "fastapi",
    id = `smoke-${randomUUID().slice(0, 8)}`;
  const owned = createOwnedMobileProject(backend, id),
    name = `native-${id}`;
  let setupAttempted = false,
    failure: unknown,
    cleanupFailure: unknown;
  try {
    runPnpm(ROOT, [
      "new",
      owned.project,
      ...(scenario === "standalone"
        ? ["--template", "expo"]
        : [
            "--api",
            backend,
            "--mobile",
            ...(scenario === "nestjs-all" ? ["--web", "--admin"] : []),
          ]),
      "--name",
      name,
      "--no-git",
    ]);
    const mobile = scenario === "standalone" ? owned.project : join(owned.project, "apps/mobile");
    runPnpm(owned.project, ["install", "--frozen-lockfile"]);
    if (scenario !== "standalone") {
      runPnpm(mobile, ["install", "--frozen-lockfile"]);
      if (backend === "nestjs")
        runPnpm(join(owned.project, "apps/api"), ["install", "--frozen-lockfile"]);
      const lock = parseAllDocuments(readFileSync(join(mobile, "pnpm-lock.yaml"), "utf8"))
        .at(-1)
        ?.toJS() as {
        importers: Record<string, unknown>;
      };
      if (Object.keys(lock.importers).join(",") !== "." || existsSync(join(mobile, "contract")))
        throw new Error("Generated mobile boundary changed.");
      const workflow = parse(
        readFileSync(join(owned.project, ".github/workflows/ci.yml"), "utf8"),
      ) as { jobs: Record<string, unknown> };
      if (!workflow.jobs["mobile-android"] || !workflow.jobs["mobile-ios"])
        throw new Error("Generated native CI is missing.");
    }
    setupAttempted = true;
    runPnpm(owned.project, ["setup"]);
    if (scenario === "nestjs-all")
      for (const app of ["web", "admin"])
        runPnpm(owned.project, ["--filter", app, "exec", "playwright", "install-deps", "chromium"]);
    runPnpm(owned.project, ["check"]);
    if (scenario !== "standalone") {
      process.env.E2E_SKIP_MOBILE = "1";
      runPnpm(owned.project, ["test:e2e"]);
      delete process.env.E2E_SKIP_MOBILE;
    }
    runPnpm(mobile, ["gen"]);
    runPnpm(mobile, ["export", "--platform", "android"]);
    runPnpm(mobile, ["export", "--platform", "ios"]);
    console.log(
      `Generated Expo ${scenario}: frozen boundaries, setup/check, selected API/web/admin E2E and native exports passed.`,
    );
  } catch (error) {
    failure = error;
  } finally {
    delete process.env.E2E_SKIP_MOBILE;
    try {
      if (scenario !== "standalone" && setupAttempted)
        execFileSync("docker", ["compose", "-p", name, "down", "--volumes", "--remove-orphans"], {
          cwd: join(owned.project, "apps/api"),
          stdio: "inherit",
          env: { ...process.env, COMPOSE_DISABLE_ENV_FILE: "1" },
          windowsHide: true,
          timeout: 120000,
        });
      removeOwnedMobileProject(owned);
    } catch (cleanup) {
      cleanupFailure = cleanup;
    }
  }
  if (cleanupFailure)
    throw new AggregateError(
      [...(failure ? [failure] : []), cleanupFailure],
      "Generated Expo smoke cleanup failed.",
    );
  if (failure)
    throw failure instanceof Error
      ? failure
      : new Error("Generated Expo smoke failed.", { cause: failure });
}
