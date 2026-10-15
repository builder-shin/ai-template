import type { ChildProcess } from "node:child_process";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { startProcessTree, stopProcessTree } from "./process-tree.mjs";
import { environment } from "./child-environment.mjs";
export interface ServerSpec {
  readonly role: "api" | "worker" | "scheduler";
  readonly argv: readonly string[];
}
export interface Servers {
  ready(timeoutMs: number): Promise<void>;
  stopAll(): Promise<void>;
  tails(): Readonly<Record<"api" | "worker" | "scheduler", string>>;
}

const secretKeys = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "IDENTIFIER_HASH_SECRET",
  "SMTP_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "OAUTH_GOOGLE_CLIENT_SECRET",
  "OAUTH_KAKAO_CLIENT_SECRET",
  "OAUTH_NAVER_CLIENT_SECRET",
  "SEED_ADMIN_PASSWORD",
];
export function redactor(...envs: NodeJS.ProcessEnv[]): (value: string) => string {
  const secrets = [
    ...new Set(
      envs.flatMap((env) =>
        secretKeys.map((key) => env[key]).filter((value): value is string => Boolean(value)),
      ),
    ),
  ].sort((a, b) => b.length - a.length);
  return (value) => secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
}
export async function startServers(options: {
  cwd: string;
  env: Record<string, string>;
  readyDir: string;
  specs: readonly ServerSpec[];
}): Promise<Servers> {
  await mkdir(options.readyDir, { recursive: true });
  const tails = { api: "", worker: "", scheduler: "" };
  const inherited = environment();
  const scrub = redactor(inherited, options.env);
  const entries: { spec: ServerSpec; child: ChildProcess; error?: Error }[] = [];
  let stopped: Promise<void> | undefined;
  const stopAll = () =>
    (stopped ??= (async () => {
      const results = await Promise.allSettled(entries.map(({ child }) => stopProcessTree(child)));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    })());
  try {
    for (const spec of options.specs) {
      await rm(join(options.readyDir, `${spec.role}.json`), { force: true });
      const child = startProcessTree([...spec.argv], {
        cwd: options.cwd,
        env: { ...inherited, ...options.env, AITPL_READY_DIR: options.readyDir },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const entry: { spec: ServerSpec; child: ChildProcess; error?: Error } = { spec, child };
      entries.push(entry);
      child.on("error", (error: Error) => {
        entry.error = error;
      });
      // 원문은 마지막 출력만 보관하며 표시 전에 상속 환경과 자식 환경을 함께 가린다.
      for (const stream of [child.stdout, child.stderr])
        stream?.on("data", (chunk: Buffer) => {
          tails[spec.role] = (tails[spec.role] + chunk.toString()).slice(-32768);
        });
    }
  } catch (error) {
    await stopAll();
    throw error;
  }
  return {
    async ready(timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        let all = true;
        for (const { spec, child, error } of entries) {
          if (error || child.exitCode !== null || child.signalCode !== null)
            throw new Error(`${spec.role} 서버가 준비 전에 끝났다`);
          try {
            const record: unknown = JSON.parse(
              await readFile(join(options.readyDir, `${spec.role}.json`), "utf8"),
            );
            if (
              typeof record !== "object" ||
              record === null ||
              !("pid" in record) ||
              record.pid !== child.pid
            )
              all = false;
          } catch {
            all = false;
          }
        }
        if (all) return;
        if (Date.now() >= deadline) throw new Error("서버 준비 한도를 넘겼다");
        await setTimeout(25);
      }
    },
    stopAll,
    tails: () => ({
      api: scrub(tails.api).slice(-8192),
      worker: scrub(tails.worker).slice(-8192),
      scheduler: scrub(tails.scheduler).slice(-8192),
    }),
  };
}
