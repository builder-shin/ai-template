import { Controller, Get, Module, Res } from "@nestjs/common";
import type { Response } from "express";
import { once } from "node:events";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { settings, testApp, publicFixtureOperation } from "../../http/tests/fixtures.js";

afterEach(() => vi.restoreAllMocks());
let started: () => void;
@Controller()
class SlowController {
  @Get("/api/v1/slow")
  @publicFixtureOperation()
  async slow(@Res() res: Response) {
    const closed = once(res, "close");
    started();
    await closed;
  }
}
@Module({ controllers: [SlowController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class SlowModule {}

it("클라이언트가 끊은 요청도 접근 로그를 한 줄 남긴다", async () => {
  const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const { app } = await testApp([SlowModule], { settings: { ...settings, LOG_LEVEL: "info" } });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const address = app.getHttpServer().address() as AddressInfo;
  const req = request({ host: "127.0.0.1", port: address.port, path: "/api/v1/slow" });
  req.on("error", () => {});
  req.end();
  await ready;
  req.destroy();
  await vi.waitFor(() => {
    const lines = stdout.mock.calls.map(
      ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
    );
    const access = lines.filter((line) => line.path === "/api/v1/slow");
    expect(access).toHaveLength(1);
    expect(access[0]).toMatchObject({ method: "GET", aborted: true });
  });
  await setImmediate();
  expect(
    stdout.mock.calls.filter(([line]) => String(line).includes('"aborted":true')),
  ).toHaveLength(1);
});
