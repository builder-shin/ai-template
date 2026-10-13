import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inputFiles } from "./files.js";
import { gitEnvironment } from "./git-environment.js";
import type { Stage, StageName } from "./stages.js";

function inputHash(stage: Stage, root: string): string {
  const hash = createHash("sha256").update(JSON.stringify(stage.inputs));
  for (const file of inputFiles(root, stage.inputs)) {
    const content = readFileSync(join(root, file));
    hash.update(JSON.stringify([file, content.length])).update(content);
  }
  if (stage.name === "harness") {
    try {
      hash.update(
        execFileSync("git", ["ls-files", "--", "src/generated"], {
          cwd: root,
          stdio: ["ignore", "pipe", "pipe"],
          env: gitEnvironment(),
        }),
      );
    } catch {
      hash.update("git 추적 상태를 확인할 수 없다");
    }
  }
  return hash.digest("hex");
}

function cached(path: string, hash: string, command: readonly string[]): boolean {
  try {
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    return (
      typeof data === "object" &&
      data !== null &&
      "hash" in data &&
      data.hash === hash &&
      "command" in data &&
      JSON.stringify(data.command) === JSON.stringify(command)
    );
  } catch {
    return false;
  }
}

function execute(
  command: readonly string[],
  root: string,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const [executable, ...args] = command;
    if (!executable) {
      resolve({ ok: false, output: "실행할 명령이 없다\n" });
      return;
    }
    const child = spawn(executable, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (text: string) => {
      output += text;
    });
    child.stderr.setEncoding("utf8").on("data", (text: string) => {
      output += text;
    });
    child.on("error", (error) => {
      resolve({ ok: false, output: `${error.message}\n` });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output });
    });
  });
}

export async function runStages(
  stages: readonly Stage[],
  options: { fast: boolean; root: string; cacheDir: string },
): Promise<{ ok: boolean; failed?: StageName; output: string; seconds: number }> {
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  const messages: string[] = [];
  mkdirSync(options.cacheDir, { recursive: true });
  for (const stage of stages) {
    if (options.fast && stage.fastSkip) {
      messages.push(`${stage.name} 건너뜀(--fast)`);
      continue;
    }
    try {
      const hash = inputHash(stage, options.root);
      const path = join(options.cacheDir, `${stage.name}.json`);
      if (cached(path, hash, stage.command)) {
        messages.push(`${stage.name} 건너뜀(입력 변화 없음)`);
        continue;
      }
      const result = await execute(stage.command, options.root);
      if (!result.ok)
        return { ok: false, failed: stage.name, output: result.output, seconds: seconds() };
      writeFileSync(path, `${JSON.stringify({ hash, command: stage.command })}\n`);
    } catch (error) {
      return { ok: false, failed: stage.name, output: `${String(error)}\n`, seconds: seconds() };
    }
  }
  return { ok: true, output: messages.join("\n"), seconds: seconds() };
}
