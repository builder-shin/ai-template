/**
 * 요청 본문 한도(413): 1 MiB를 넘는 본문을 버린 뒤 거절한다. FastAPI 템플릿의
 * test_body_limit.py와 같은 경우와 버리기 한도를 본다.
 */

import { describe, expect, it, vi } from "vitest";
import { MAX_BODY_SIZE } from "../src/jsonapi/body-limit.ts";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import { codesOf, echoApp, errorsOf } from "./support.ts";

const ECHO = "/api/v1/echo";
const CHUNK = 64 * 1024;

/** 길이를 알리지 않는(chunked) 본문. size바이트를 CHUNK씩 보낸다. */
function chunks(size: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) {
        controller.close();
        return;
      }
      const part = Math.min(CHUNK, size - sent);
      sent += part;
      controller.enqueue(new Uint8Array(part).fill(0x78));
    },
  });
}

/** 스트림 본문 요청. fetch 규격상 스트림 본문에는 duplex가 필요하다. */
function streamed(body: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return {
    method: "POST",
    body,
    duplex: "half",
    headers: { "Content-Type": JSONAPI_MEDIA_TYPE, ...headers },
  } as RequestInit;
}

describe("본문 한도", () => {
  it("한도를 넘는 본문은 413 jsonapi.content_too_large이고 연결을 유지한다", async () => {
    const { app } = echoApp();
    const response = await app.request(ECHO, {
      method: "POST",
      body: new Uint8Array(MAX_BODY_SIZE + 1),
      headers: { "Content-Type": JSONAPI_MEDIA_TYPE },
    });
    expect(response.headers.get("connection")).toBeNull();
    expect(await errorsOf(response, 413)).toEqual([
      {
        status: "413",
        code: "jsonapi.content_too_large",
        title: "Content Too Large",
        detail: "The request body must be at most 1048576 bytes.",
      },
    ]);
  });

  it("Content-Length가 한도를 넘으면 본문을 버린 뒤 거절한다", async () => {
    const { app } = echoApp();
    let pulled = false;
    // highWaterMark 0: 누가 읽을 때만 pull이 불린다.
    const untouched = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulled = true;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const init = streamed(untouched, { "Content-Length": String(MAX_BODY_SIZE + 1) });
    expect(await codesOf(await app.request(ECHO, init), 413)).toEqual([
      "jsonapi.content_too_large",
    ]);
    expect(pulled).toBe(true);
  });

  it.each([true, false])("16 MiB를 넘으면 연결을 닫는다(Content-Length: %s)", async (length) => {
    const { app } = echoApp();
    const size = 16 * 1024 * 1024 + 1;
    const headers = length ? { "Content-Length": String(size) } : {};
    const response = await app.request(ECHO, streamed(chunks(size), headers));
    expect(await codesOf(response, 413)).toEqual(["jsonapi.content_too_large"]);
    expect(response.headers.get("connection")).toBe("close");
  });

  it.each([true, false])(
    "초과 본문이 멈춰도 5초 뒤 413으로 닫는다(Content-Length: %s)",
    async (length) => {
      vi.useFakeTimers();
      try {
        const { app } = echoApp();
        let pulled = false;
        const stalled = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pulled) return;
            pulled = true;
            controller.enqueue(new Uint8Array(MAX_BODY_SIZE + 1));
          },
        });
        const headers = length ? { "Content-Length": String(MAX_BODY_SIZE + 1) } : {};
        const pending = app.request(ECHO, streamed(stalled, headers));
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(5_000);
        const response = await pending;
        expect(await codesOf(response, 413)).toEqual(["jsonapi.content_too_large"]);
        expect(response.headers.get("connection")).toBe("close");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("길이를 알리지 않은 본문은 읽으면서 센다", async () => {
    const { app } = echoApp();
    const response = await app.request(ECHO, streamed(chunks(MAX_BODY_SIZE + 1)));
    expect(await codesOf(response, 413)).toEqual(["jsonapi.content_too_large"]);
  });

  it("한도와 같은 크기는 핸들러까지 그대로 간다", async () => {
    const { app } = echoApp();
    const whole = await app.request(ECHO, {
      method: "POST",
      body: new Uint8Array(MAX_BODY_SIZE),
      headers: { "Content-Type": JSONAPI_MEDIA_TYPE },
    });
    expect(await whole.json()).toEqual({ size: MAX_BODY_SIZE });
    const streamedBody = await app.request(ECHO, streamed(chunks(MAX_BODY_SIZE)));
    expect(await streamedBody.json()).toEqual({ size: MAX_BODY_SIZE });
  });

  it("협상(415)이 한도보다 먼저다", async () => {
    const { app } = echoApp();
    const response = await app.request(ECHO, {
      method: "POST",
      body: new Uint8Array(MAX_BODY_SIZE + 1),
      headers: { "Content-Type": "text/plain" },
    });
    expect(await codesOf(response, 415)).toEqual(["jsonapi.unsupported_media_type"]);
  });

  it("/api/ 밖의 요청에는 한도를 걸지 않는다", async () => {
    const { app } = echoApp();
    app.post("/outside", async (c) => c.json({ size: (await c.req.arrayBuffer()).byteLength }));
    const response = await app.request("/outside", {
      method: "POST",
      body: new Uint8Array(MAX_BODY_SIZE + 1),
    });
    expect(await response.json()).toEqual({ size: MAX_BODY_SIZE + 1 });
  });
});
