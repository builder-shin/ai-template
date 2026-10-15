import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
const state = vi.hoisted((): { app: unknown } => ({ app: undefined }));
vi.mock("../create-app.js", () => ({ createApp: () => Promise.resolve(state.app) }));
import { bootstrap } from "../../../main.js";

it("API listen 실패는 만든 Nest 앱을 닫고 같은 오류를 전한다", async () => {
  const server = createServer();
  const error = new Error("포트 사용 중");
  const close = vi.fn(() => {
    server.emit("close");
    return Promise.resolve();
  });
  state.app = {
    getHttpServer: () => server,
    get: () => ({ PORT: 8000 }),
    listen: () => Promise.reject(error),
    close,
  };
  try {
    await expect(bootstrap()).rejects.toBe(error);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    server.emit("close");
  }
});
it("API는 처리기 설치 뒤 listen 콜백에서만 현재 PID 준비 기록을 쓴다", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aitpl-bootstrap-"));
  vi.stubEnv("AITPL_READY_DIR", dir);
  const server = createServer();
  const before = process.listenerCount("SIGTERM");
  state.app = {
    getHttpServer: () => server,
    get: () => ({ PORT: 18000 }),
    listen: async (_port: number, _host: string, callback: () => void) => {
      expect(process.listenerCount("SIGTERM")).toBe(before + 1);
      await expect(readFile(join(dir, "api.json"), "utf8")).rejects.toThrow();
      callback();
    },
    close: () => Promise.resolve(),
  };
  try {
    await bootstrap();
    expect(JSON.parse(await readFile(join(dir, "api.json"), "utf8")) as unknown).toEqual({
      pid: process.pid,
    });
  } finally {
    server.emit("close");
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});
