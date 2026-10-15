import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChildProcess } from "node:child_process";
import { redactor, type ServerSpec } from "./servers.js";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";
import { environment } from "./child-environment.mjs";
import { isMain, main, scriptSettings } from "./runtime.js";
export async function runDev(options: {
  cwd: string;
  env: Record<string, string>;
  specs?: readonly ServerSpec[];
  signal?: AbortSignal;
}): Promise<number> {
  const children: ChildProcess[] = [];
  const env = { ...environment(), ...options.env };
  if (!options.specs)
    env.NODE_OPTIONS = [
      env.NODE_OPTIONS,
      `--import=${pathToFileURL(resolve(options.cwd, "scripts/swc-loader.mjs")).href}`,
      `--import=${pathToFileURL(resolve(options.cwd, "src/core/telemetry/register.ts")).href}`,
    ]
      .filter(Boolean)
      .join(" ");
  const specs = options.specs ?? [
    {
      role: "api",
      argv: ["node_modules/@nestjs/cli/bin/nest.js", "start", "-b", "swc", "--watch"],
    },
    { role: "worker", argv: ["--watch", "src/worker.ts"] },
    { role: "scheduler", argv: ["--watch", "src/scheduler.ts"] },
  ];
  const scrub = redactor(environment(), env);
  let interrupted: number | undefined;
  let finish!: (code: number) => void;
  const result = new Promise<number>((resolve) => {
    finish = resolve;
  });
  const onInt = () => {
    interrupted ??= 130;
    finish(interrupted);
  };
  const onTerm = () => {
    interrupted ??= 143;
    finish(interrupted);
  };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  options.signal?.addEventListener("abort", onInt);
  let code: number;
  let cleanupFailed: boolean;
  try {
    if (options.signal?.aborted) onInt();
    else
      for (const spec of specs) {
        const child = startProcessTree([...spec.argv], {
          cwd: options.cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        children.push(child);
        for (const [stream, output] of [
          [child.stdout, process.stdout],
          [child.stderr, process.stderr],
        ] as const) {
          let pending = "";
          stream?.on("data", (data: Buffer) => {
            pending += data.toString();
            const lines = pending.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) output.write(`[${spec.role}] ${scrub(line)}\n`);
          });
          stream?.on("end", () => {
            if (pending) output.write(`[${spec.role}] ${scrub(pending)}\n`);
          });
        }
        child.once("error", () => {
          finish(1);
        });
        child.once("exit", (code: number | null) => {
          finish(code ?? 1);
        });
      }
    code = await result;
  } finally {
    const stopped = await Promise.allSettled(children.map((child) => stopProcessTree(child)));
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    options.signal?.removeEventListener("abort", onInt);
    cleanupFailed = stopped.some((item) => item.status === "rejected");
  }
  return interrupted ?? (cleanupFailed ? 1 : code);
}
if (isMain(import.meta.url))
  await main(async () => {
    scriptSettings();
    return runDev({
      cwd: process.cwd(),
      env: Object.fromEntries(
        Object.entries(environment()).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    });
  });
