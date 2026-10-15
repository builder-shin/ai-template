import { environment } from "../child-environment.mjs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { expect, it } from "vitest";
import { startProcessTree, stopProcessTree } from "../process-tree.mjs";
import { gone, bindable } from "./fixtures/process-probes.js";

it.skipIf(process.platform === "win32").each([
  { signal: "SIGINT", code: 130 },
  { signal: "SIGTERM", code: 143 },
] as const)(
  "POSIX $signal 뒤 20초 안에 $code 종료 코드로 끝나고 모든 소유 그룹과 포트를 회수한다",
  async ({ signal, code }) => {
    const dir = await mkdtemp(join(tmpdir(), "aitpl-signals-"));
    const readyDir = join(dir, "ready");
    const secret = "signal-fixture-private-value"; // betterleaks:allow 사유: 비밀 가림 시험의 가짜 값
    const driver = startProcessTree(
      ["--import", "tsx", resolve("scripts/tests/fixtures/serve-driver.ts")],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...environment(),
          DATABASE_URL: "postgresql://app:app@127.0.0.1:25432/app", // betterleaks:allow 사유: 연결하지 않는 가짜 주소
          REDIS_URL: "redis://127.0.0.1:26379/0",
          AITPL_READY_DIR: readyDir,
          JWT_SECRET: secret,
          AITPL_FIXTURE_SECRET: secret,
        }, // betterleaks:allow 사유: 연결하지 않는 가짜 주소
      },
    );
    let output = "";
    driver.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    driver.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    const exited = once(driver, "exit");
    try {
      await expect
        .poll(
          async () =>
            (await readdir(readyDir).catch(() => [])).filter((name) =>
              /^(api|worker|scheduler)\.json$/.test(name),
            ).length,
          { timeout: 10000 },
        )
        .toBe(3);
      const records = await Promise.all(
        (["api", "worker", "scheduler"] as const).map(
          async (role) =>
            JSON.parse(await readFile(join(readyDir, `${role}-observed.json`), "utf8")) as {
              pid: number;
              grandchild: number;
              port: number;
            },
        ),
      );
      await expect
        .poll(async () => {
          try {
            return JSON.parse(await readFile(join(readyDir, "command.json"), "utf8")) as unknown;
          } catch {
            return null;
          }
        })
        .not.toBeNull();
      const command = JSON.parse(await readFile(join(readyDir, "command.json"), "utf8")) as {
        pid: number;
      };
      driver.kill(signal);
      expect((await exited)[0]).toBe(code);
      for (const record of records) {
        expect(gone(record.pid)).toBe(true);
        expect(gone(-record.pid)).toBe(true);
        expect(gone(record.grandchild)).toBe(true);
        await bindable(record.port);
      }
      expect(gone(command.pid)).toBe(true);
      expect(gone(-command.pid)).toBe(true);
      expect(output).not.toContain(secret);
      expect(output).toContain("[REDACTED]");
    } finally {
      await stopProcessTree(driver);
      await rm(dir, { recursive: true, force: true });
    }
  },
  20000,
);

it("명령의 작업 폴더와 종료 코드 23을 그대로 전달한다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-command-"));
  const driver = startProcessTree(
    ["--import", "tsx", resolve("scripts/tests/fixtures/serve-driver.ts"), "exit"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...environment(),
        DATABASE_URL: "postgresql://app:app@127.0.0.1:25432/app", // betterleaks:allow 사유: 연결하지 않는 가짜 주소
        REDIS_URL: "redis://127.0.0.1:26379/0",
        AITPL_COMMAND_CWD: dir,
      }, // betterleaks:allow 사유: 연결하지 않는 가짜 주소
    },
  );
  let output = "";
  driver.stdout?.on("data", (data: Buffer) => {
    output += data.toString();
  });
  try {
    expect((await once(driver, "exit"))[0]).toBe(23);
    expect(output).toContain(dir);
  } finally {
    await stopProcessTree(driver);
    await rm(dir, { recursive: true, force: true });
  }
}, 20000);
