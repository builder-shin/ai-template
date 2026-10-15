import { environment } from "../child-environment.mjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connect } from "node:net";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { startServers, type ServerSpec } from "../servers.js";
import { gone, bindable } from "./fixtures/process-probes.js";

const roles = ["api", "worker", "scheduler"] as const;
const fixture = resolve("scripts/tests/fixtures/server.mjs");
it.skipIf(process.platform === "win32")(
  "POSIX 가짜 서버는 열린 TCP와 먼저 끝난 손자가 있어도 모든 기록한 PID·그룹을 회수한다",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "aitpl-servers-"));
    const secret = "가짜-상속-비밀-시험값"; // betterleaks:allow 사유: 비밀 가림 시험의 가짜 값
    vi.stubEnv("JWT_SECRET", secret);
    const specs: ServerSpec[] = roles.map((role) => ({
      role,
      argv: ["--import", "tsx", fixture, role, "early-grandchild"],
    }));
    let servers: Awaited<ReturnType<typeof startServers>> | undefined;
    const peers: ReturnType<typeof connect>[] = [];
    try {
      servers = await startServers({
        cwd: process.cwd(),
        env: {
          ...environment(),
          JWT_SECRET: "다른-자식-비밀", // betterleaks:allow 사유: 상속 값과 구분할 가짜 비밀
          AITPL_FIXTURE_SECRET: secret,
        },
        readyDir: dir,
        specs,
      });
      const running = servers;
      await running.ready(10000);
      const observations = await Promise.all(
        roles.map(
          async (role) =>
            JSON.parse(await readFile(join(dir, `${role}-observed.json`), "utf8")) as {
              pid: number;
              grandchild: number;
              port: number;
            },
        ),
      );
      for (const item of observations) {
        const peer = connect(item.port, "127.0.0.1");
        peers.push(peer);
        await once(peer, "connect");
      }
      await expect
        .poll(() => roles.every((role) => running.tails()[role].includes("[REDACTED]")))
        .toBe(true);
      expect(Object.values(servers.tails()).join("")).not.toContain(secret);
      const before = Date.now();
      await servers.stopAll();
      expect(Date.now() - before).toBeLessThan(3000);
      for (const item of observations) {
        expect(gone(item.pid)).toBe(true);
        expect(gone(-item.pid)).toBe(true);
        expect(gone(item.grandchild)).toBe(true);
        await bindable(item.port);
      }
      for (const role of roles)
        expect(await readFile(join(dir, `${role}-closed`), "utf8")).toBe("처리했다");
      await servers.stopAll();
    } finally {
      peers.forEach((peer) => peer.destroy());
      await servers?.stopAll();
      vi.unstubAllEnvs();
      await rm(dir, { recursive: true, force: true });
    }
  },
  20000,
);

it("준비 기록이 없는 종료 서버는 준비 성공으로 처리하지 않는다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-not-ready-"));
  let servers: Awaited<ReturnType<typeof startServers>> | undefined;
  try {
    servers = await startServers({
      cwd: process.cwd(),
      env: {},
      readyDir: dir,
      specs: [{ role: "api", argv: ["-e", "process.exit(7)"] }],
    });
    await expect(servers.ready(1000)).rejects.toThrow();
  } finally {
    await servers?.stopAll();
    await rm(dir, { recursive: true, force: true });
  }
});
