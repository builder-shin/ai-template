import { gzipSync } from "node:zlib";
import {
  Controller,
  Get,
  Post,
  Delete,
  Module,
  Body,
  HttpCode,
  UseGuards,
  Injectable,
  UnauthorizedException,
  HttpException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { ApiError, ApiErrors } from "../../jsonapi/errors.js";
import { PrismaService } from "../../db/prisma.service.js";
import { RedisClients } from "../../redis/clients.js";
import { GLOBAL_LIMITER } from "../pipeline.js";
import {
  errorDocument,
  mediaType,
  testApp,
  sendRaw,
  sendBytes,
  publicFixtureOperation,
} from "./fixtures.js";

@Injectable()
class DenyGuard {
  canActivate() {
    throw new UnauthorizedException();
  }
}
@Controller()
class EchoController {
  @Post("/api/v1/echo")
  @publicFixtureOperation()
  @HttpCode(200)
  echo(@Body() body: unknown) {
    return body;
  }
  @Post("/api/v1/protected")
  @publicFixtureOperation()
  @UseGuards(DenyGuard)
  protected() {
    return { data: null };
  }
  @Get("/api/v1/korean") @publicFixtureOperation() korean() {
    return { data: { type: "echoes", id: "1", attributes: { text: "가😀" } } };
  }
  @Delete("/api/v1/echo") @publicFixtureOperation() @HttpCode(204) remove() {}
  @Get("/api/v1/error") @publicFixtureOperation() error() {
    throw new ApiError({
      status: 422,
      code: "validation.too_short",
      title: "Too short",
      source: { pointer: "/data/attributes/title" },
      meta: { params: { min: 3 } },
    });
  }
  @Get("/api/v1/mixed") @publicFixtureOperation() mixed() {
    throw new ApiErrors(400, [
      new ApiError({ status: 404, code: "resource.not_found", title: "Not found" }),
      new ApiError({ status: 422, code: "validation.required", title: "Required" }),
    ]);
  }
  @Get("/api/v1/unexpected") @publicFixtureOperation() unexpected() {
    throw new Error("비공개 구현 오류");
  }
  @Get("/api/v1/method-error") @publicFixtureOperation() methodError() {
    throw new HttpException("비공개 오류", 405);
  }
}
@Module({ controllers: [EchoController], providers: [DenyGuard] })
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest 시험 모듈은 선언용 클래스를 사용한다
class EchoTestModule {}

describe("HTTP 파이프라인", () => {
  it("대소문자를 바꾼 API 경로로 협상과 전역 한도를 우회하지 못한다", async () => {
    const { http } = await testApp([EchoTestModule]);
    expect((await http.get("/api/v1/korean").set("Accept", "application/json")).status).toBe(406);
    expect((await http.get("/API/v1/korean").set("Accept", "application/json")).status).toBe(404);
  });
  it("JSON:API가 아닌 Content-Type 본문은 415다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await http.post("/api/v1/echo").set("Content-Type", "application/json").send("{}");
    expect(res.status).toBe(415);
    expect(res.headers["content-type"]).toBe(mediaType);
    const document = errorDocument(res.text);
    expect(document.errors[0]).toMatchObject({
      status: "415",
      code: "jsonapi.unsupported_media_type",
    });
    expect(document.errors[0]?.meta.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(document.meta.traceId).toBe(document.errors[0]?.meta.traceId);
  });
  it.each([`${mediaType};charset=utf-8`, `${mediaType};ext="https://example.com"`])(
    "Content-Type 매개변수는 415다: %s",
    async (contentType) => {
      const { http } = await testApp([EchoTestModule]);
      expect(
        (await http.post("/api/v1/echo").set("Content-Type", contentType).send("{}")).status,
      ).toBe(415);
    },
  );
  it.each([
    `${mediaType};ext="https://example.com"`,
    "application/json",
    `${mediaType};q=0`,
    `${mediaType};q=0, */*;q=1`,
  ])("JSON:API를 허용하지 않는 Accept는 406이다: %s", async (accept) => {
    const { http } = await testApp([EchoTestModule]);
    const res = await http.get("/api/v1/korean").set("Accept", accept);
    expect(res.status).toBe(406);
    expect(errorDocument(res.text).errors[0]?.code).toBe("jsonapi.not_acceptable");
  });
  it.each([
    "*/*",
    "application/*",
    `${mediaType};q=0.5, application/json`,
    `${mediaType};ext="https://example.com", ${mediaType}`,
  ])("허용하는 Accept는 문서를 받는다: %s", async (accept) => {
    const { http } = await testApp([EchoTestModule]);
    expect((await http.get("/api/v1/korean").set("Accept", accept)).status).toBe(200);
  });
  it("1,048,576바이트는 받고 1,048,577바이트는 413이다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const prefix = '{"data":{"type":"echoes","attributes":{"text":"';
    const suffix = '"}}}';
    const exact = prefix + "a".repeat(1048576 - prefix.length - suffix.length) + suffix;
    expect(
      (await http.post("/api/v1/echo").set("Content-Type", mediaType).send(exact)).status,
    ).toBe(200);
    expect(Buffer.byteLength(exact)).toBe(1048576);
    expect(Buffer.byteLength(exact + " ")).toBe(1048577);
    const res = await sendBytes(
      http.post("/api/v1/echo").set("Content-Type", mediaType),
      exact + " ",
    );
    expect(res.status).toBe(413);
    expect(errorDocument(res.text).errors[0]?.code).toBe("jsonapi.content_too_large");
  });
  it("본문 전송 중 조기 거절한 413 문서를 실제로 받는다", async () => {
    const { app, http } = await testApp([EchoTestModule]);
    const server: Server = app.getHttpServer();
    const finished: { status: number; contentType: number | string | string[] | undefined }[] = [];
    const observe = (_req: IncomingMessage, res: ServerResponse) => {
      res.once("finish", () => {
        finished.push({ status: res.statusCode, contentType: res.getHeader("content-type") });
      });
    };
    server.on("request", observe);
    const prefix = '{"data":{"type":"echoes","attributes":{"text":"';
    const suffix = '"}}}';
    const exact = prefix + "a".repeat(1048576 - prefix.length - suffix.length) + suffix;
    try {
      expect(
        (await http.post("/api/v1/echo").set("Content-Type", mediaType).send(exact)).status,
      ).toBe(200);
      const res = await sendBytes(
        http.post("/api/v1/echo").set("Content-Type", mediaType),
        exact + " ",
      );
      expect(res.status).toBe(413);
      expect(errorDocument(res.text).errors[0]?.code).toBe("jsonapi.content_too_large");
      expect(finished).toEqual([
        { status: 200, contentType: mediaType },
        { status: 413, contentType: mediaType },
      ]);
    } catch (error) {
      process.stderr.write(`조기 응답 관측: ${JSON.stringify(finished)}\n`);
      throw error;
    } finally {
      server.off("request", observe);
    }
  });
  it("길이가 없는 청크 본문도 바이트 한도를 적용한다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await sendRaw(
      http.post("/api/v1/echo").set("Content-Type", mediaType),
      Buffer.alloc(1048577, "a"),
    );
    expect(res.status).toBe(413);
  });
  it("415가 413보다, 406이 413보다 먼저다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const oversized = "a".repeat(1048577);
    expect(
      (
        await sendBytes(
          http.post("/api/v1/echo").set("Content-Type", "application/json"),
          oversized,
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await sendBytes(
          http
            .post("/api/v1/echo")
            .set("Content-Type", mediaType)
            .set("Accept", "application/json"),
          oversized,
        )
      ).status,
    ).toBe(406);
  });
  it.each(["{", "null", "[]", '"문자열"'])(
    "JSON 문법이나 최상위 문서 구조가 틀리면 400이다: %s",
    async (body) => {
      const { http } = await testApp([EchoTestModule]);
      const res = await http.post("/api/v1/echo").set("Content-Type", mediaType).send(body);
      expect(res.status).toBe(400);
      expect(errorDocument(res.text).errors[0]?.code).toBe("jsonapi.invalid_document");
    },
  );
  it("압축한 입력은 압축을 풀지 않는다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await sendRaw(
      http.post("/api/v1/echo").set("Content-Type", mediaType).set("Content-Encoding", "gzip"),
      gzipSync('{"data":null}'),
    );
    expect(res.status).toBe(400);
  });
  it("413과 JSON 400은 인증 401보다 먼저다", async () => {
    const { http } = await testApp([EchoTestModule]);
    expect(
      (
        await sendBytes(
          http.post("/api/v1/protected").set("Content-Type", mediaType),
          "a".repeat(1048577),
        )
      ).status,
    ).toBe(413);
    expect(
      (await http.post("/api/v1/protected").set("Content-Type", mediaType).send("{")).status,
    ).toBe(400);
    const res = await http
      .post("/api/v1/protected")
      .set("Content-Type", mediaType)
      .send('{"data":null}');
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe("Bearer");
  });
  it("전역 한도는 협상보다 먼저이며 API 경로에만 적용한다", async () => {
    const { http } = await testApp([EchoTestModule], {
      providers: [
        {
          provide: GLOBAL_LIMITER,
          useValue: () => {
            return Promise.reject(
              new ApiError({
                status: 429,
                code: "rate_limit.exceeded",
                title: "Too many requests",
                headers: { "Retry-After": "5" },
              }),
            );
          },
        },
      ],
    });
    const res = await http.post("/api/v1/echo").set("Content-Type", "application/json").send("{}");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("5");
    expect((await http.get("/health/live")).status).toBe(200);
  });
  it.each(["/api/v1/korean", "/health/live", "/unknown"])(
    "HEAD는 어느 경로든 404다: %s",
    async (path) => {
      const { http } = await testApp([EchoTestModule]);
      const res = await http.head(path);
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toBe(mediaType);
      expect(res.text).toBeUndefined();
    },
  );
  it("끝 슬래시와 미등록 경로, 지원하지 않는 메서드는 Allow 없는 404 문서다", async () => {
    const { http } = await testApp([EchoTestModule]);
    for (const res of [
      await http.get("/api/v1/korean/"),
      await http.get("/unknown"),
      await http.put("/api/v1/echo"),
      await http.get("/api/v1/method-error"),
    ]) {
      expect(res.status).toBe(404);
      expect(res.headers.allow).toBeUndefined();
      expect(res.headers["content-type"]).toBe(mediaType);
      expect(errorDocument(res.text).errors[0]?.code).toBe("resource.not_found");
    }
  });
  it("문서는 비 ASCII를 소문자 이스케이프로 쓰고 204는 비운다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await http.get("/api/v1/korean");
    expect(res.headers["content-type"]).toBe(mediaType);
    expect(res.text).toContain('"\\uac00\\ud83d\\ude00"');
    expect((await http.delete("/api/v1/echo")).text).toBe("");
  });
  it("도메인 오류의 위치와 매개변수를 유지하고 혼합 상태를 묶는다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await http.get("/api/v1/error");
    expect(res.status).toBe(422);
    expect(errorDocument(res.text).errors[0]).toMatchObject({
      source: { pointer: "/data/attributes/title" },
      meta: { params: { min: 3 } },
    });
    const mixed = await http.get("/api/v1/mixed");
    expect(mixed.status).toBe(400);
    expect(errorDocument(mixed.text).errors.map((error) => error.status)).toEqual(["404", "422"]);
  });
  it("예상하지 못한 오류는 구현 메시지를 숨긴 500이다", async () => {
    const { http } = await testApp([EchoTestModule]);
    const res = await http.get("/api/v1/unexpected");
    expect(res.status).toBe(500);
    expect(errorDocument(res.text).errors[0]?.code).toBe("internal.unexpected");
    expect(res.text).not.toContain("비공개");
  });
  it("인프라를 끄면 Prisma와 Redis 제공자를 만들지 않는다", async () => {
    const { app } = await testApp([EchoTestModule]);
    expect(() => app.get(PrismaService)).toThrow();
    expect(() => app.get(RedisClients)).toThrow();
  });
});
