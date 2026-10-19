import { Controller, Get, Module, Res } from "@nestjs/common";
import type { Response } from "express";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { JsonLogger } from "../../logging/json-logger.js";
import { ApiExceptionFilter } from "../exception.filter.js";
import { publicFixtureOperation, testApp } from "./fixtures.js";

afterEach(() => vi.restoreAllMocks());

@Controller()
class PartialController {
  @Get("/api/v1/partial")
  @publicFixtureOperation()
  async partial(@Res() res: Response) {
    res.write("partial");
    await setImmediate();
    throw new Error("응답 도중 예외");
  }
}
@Module({ controllers: [PartialController] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class PartialModule {}

it("헤더를 보낸 뒤의 예외도 기록하고 응답을 끊는다", async () => {
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const { app } = await testApp([PartialModule]);
  const address = app.getHttpServer().address() as AddressInfo;
  const outcome = await new Promise<string>((resolve) => {
    const req = request({ host: "127.0.0.1", port: address.port, path: "/api/v1/partial" });
    req.on("response", (res) => {
      res.resume();
      res.on("aborted", () => {
        resolve("aborted");
      });
      res.on("end", () => {
        resolve("end");
      });
    });
    req.on("error", () => {
      resolve("aborted");
    });
    req.setTimeout(300, () => {
      resolve("timeout");
      req.destroy();
    });
    req.end();
  });
  expect(outcome).toBe("aborted");
  expect(stderr).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(stderr.mock.calls[0]?.[0])) as unknown).toMatchObject({
    level: "error",
    message: "응답 도중 예외",
  });
});

it("Error가 아닌 예외 값은 cause로 보존한다", () => {
  const logger = new JsonLogger([]);
  const error = vi.spyOn(logger, "error");
  const destroy = vi.fn();
  const value = { reason: "예외 값" };
  const res = { headersSent: true, writableEnded: false, destroy } as unknown as Response;
  new ApiExceptionFilter(logger).respond(value, res);
  expect(error).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: "예상하지 못한 오류", cause: value }),
  );
  expect(destroy).toHaveBeenCalledTimes(1);
});
