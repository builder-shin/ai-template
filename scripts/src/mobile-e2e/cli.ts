import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createMobilePlan, ROOT, type Backend } from "./plan.ts";
import { validateMobileCompose } from "./config.ts";
import { execute, probePorts, type CommandOptions } from "../web-e2e/process.ts";
import { downMobileStack, runMobileStack } from "./run.ts";
import { preflightMobileDevice } from "./device.ts";
import {
  createOwnedMobileProject,
  readOwnedMobileProject,
  removeOwnedMobileProject,
} from "./owned.ts";

async function main(): Promise<number> {
  const { values, positionals, tokens } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    tokens: true,
    options: {
      platform: { type: "string", default: "android" },
      device: { type: "string" },
      "run-id": { type: "string" },
      print: { type: "boolean" },
      keep: { type: "boolean" },
      down: { type: "boolean" },
    },
  });
  const seen = new Set<string>();
  for (const token of tokens)
    if (token.kind === "option") {
      if (seen.has(token.name)) throw new Error("Duplicate native runner option.");
      seen.add(token.name);
    }
  if (
    positionals.length !== 1 ||
    !["fastapi", "nestjs"].includes(positionals[0] ?? "") ||
    !["android", "ios"].includes(values.platform) ||
    (!values.down && !values.device) ||
    (values.down && !values["run-id"]) ||
    (values.down && values.keep)
  )
    throw new Error(
      "pnpm mobile-e2e fastapi|nestjs --platform android|ios --device <id> [--run-id <id>] [--print|--keep|--down]",
    );
  if (values.device && !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(values.device))
    throw new Error("Invalid explicit native device.");
  const plan = createMobilePlan(
    positionals[0] as Backend,
    values["run-id"] ?? randomUUID().slice(0, 12),
  );
  validateMobileCompose(readFileSync(join(ROOT, plan.composeFile), "utf8"), plan);
  console.log(
    JSON.stringify(
      { project: plan.project, env: plan.env, urls: plan.urls, commands: plan.commands },
      null,
      2,
    ),
  );
  if (values.print) return 0;
  const controller = new AbortController(),
    interrupt = () => {
      controller.abort(130);
    },
    terminate = () => {
      controller.abort(143);
    };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  let owned = readOwnedMobileProject(plan.backend, plan.runId),
    kept = false;
  const env: Record<string, string> = {
    ...plan.env,
    MOBILE_E2E_BUILD_CONTEXT: owned?.project ?? join(ROOT, "templates", plan.backend),
    MOBILE_E2E_CALLBACK: "aitemplate://oauth/callback",
  };
  const run = (argv: readonly string[], options: CommandOptions = {}) =>
    execute(argv, env, { ...options, tree: true });
  const deps = {
    execute: run,
    log: console.error,
    onCleanupFailure: () => {
      kept = true;
    },
  };
  try {
    if (values.down) {
      const code = await downMobileStack(plan, deps);
      if (code === 0 && owned) {
        removeOwnedMobileProject(owned);
        owned = undefined;
      }
      return code;
    }
    if (owned)
      throw new Error("This native run already owns a generated project; use --down first.");
    await preflightMobileDevice(values.platform as "android" | "ios", values.device ?? "", run);
    await probePorts(plan.ports);
    for (const argv of [plan.commands.containers, plan.commands.volumes]) {
      const result = await run(argv, { capture: true, signal: controller.signal });
      if (result.code !== 0 || result.stdout.trim())
        throw new Error("Native stack inventory is unavailable or already occupied.");
    }
    const entry = process.env.npm_execpath;
    if (!entry) throw new Error("Use pnpm mobile-e2e.");
    const pnpm = /\.[cm]?js$/.test(entry) ? [process.execPath, entry] : [entry];
    owned = createOwnedMobileProject(plan.backend, plan.runId);
    const generated = await run(
      [
        ...pnpm,
        "new",
        owned.project,
        "--api",
        plan.backend,
        "--mobile",
        "--name",
        `native-${plan.runId}`,
        "--no-git",
      ],
      { signal: controller.signal },
    );
    if (generated.code !== 0) return generated.code;
    const mobile = join(owned.project, "apps/mobile");
    const identity = JSON.parse(readFileSync(join(mobile, "app-identity.json"), "utf8")) as {
      scheme: string;
    };
    env.MOBILE_E2E_BUILD_CONTEXT =
      plan.backend === "fastapi" ? join(owned.project, "apps/api") : owned.project;
    env.MOBILE_E2E_CALLBACK = `${identity.scheme}://oauth/callback`;
    const code = await runMobileStack(
      plan,
      { keep: values.keep === true, signal: controller.signal },
      {
        ...deps,
        probe: () => probePorts(plan.ports),
        ready: async (signal) => {
          for (const url of [
            plan.urls.api + "/health/ready",
            plan.urls.mail + "/readyz",
            plan.urls.oauth + "/default/.well-known/openid-configuration",
          ]) {
            const deadline = Date.now() + 60000;
            for (;;) {
              signal?.throwIfAborted();
              try {
                const response = await fetch(url, {
                  signal: AbortSignal.any([AbortSignal.timeout(2000), ...(signal ? [signal] : [])]),
                });
                await response.arrayBuffer();
                if (response.ok) break;
              } catch {
                signal?.throwIfAborted();
              }
              if (Date.now() >= deadline) throw new Error("Native backend readiness timed out.");
              await sleep(200, undefined, signal ? { signal } : {});
            }
          }
        },
        command: async (signal) =>
          (
            await execute(
              [
                ...pnpm,
                "--dir",
                mobile,
                "test:e2e",
                "--platform",
                values.platform,
                "--device",
                values.device ?? "",
                "--target",
                plan.backend,
                "--run-id",
                plan.runId,
              ],
              {
                EXPO_NO_DOTENV: "1",
                EXPO_PUBLIC_API_MODE: "backend",
                EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:4112/api/v1",
                EXPO_PUBLIC_REALTIME_URL: "http://127.0.0.1:4112",
                EXPO_PUBLIC_FRONTEND_URL: "http://127.0.0.1:3112",
                E2E_UPSTREAM_API_URL: plan.urls.api,
                E2E_MAILPIT_URL: plan.urls.mail,
                E2E_OAUTH_URL: plan.urls.oauth,
                E2E_REVERSE_PORTS: "28435,28182",
              },
              { tree: true, ...(signal ? { signal } : {}) },
            )
          ).code,
      },
    );
    kept ||= values.keep === true && code === 0;
    return code;
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    if (owned && !kept) removeOwnedMobileProject(owned);
  }
}
try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
