/** 실제 Node HTTP 연결에서도 느린 초과 본문을 다 보낸 뒤 413 문서를 받을 수 있어야 한다. */

import { once } from "node:events";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as pause } from "node:timers/promises";
import { serve } from "@hono/node-server";
import { describe, expect, it, onTestFinished } from "vitest";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import { echoApp, errorsOf } from "./support.ts";

const BODY_SIZE = 2 * 1024 * 1024;
const CHUNK = Buffer.alloc(64 * 1024, 0x78);

async function slowUpload(url: string, declaredLength: boolean): Promise<Response> {
  const client = request(url, {
    method: "POST",
    headers: {
      "Content-Type": JSONAPI_MEDIA_TYPE,
      ...(declaredLength ? { "Content-Length": BODY_SIZE } : {}),
    },
  });
  onTestFinished(() => {
    client.destroy();
  });
  const received = new Promise<Response>((resolve, reject) => {
    client.once("error", reject);
    client.once("response", (incoming) => {
      const status = incoming.statusCode;
      if (status === undefined) {
        reject(new Error("HTTP 응답 상태가 없다."));
        return;
      }
      const parts: Buffer[] = [];
      incoming.on("data", (part: Buffer) => parts.push(part));
      incoming.once("error", reject);
      incoming.once("end", () => {
        resolve(
          new Response(Buffer.concat(parts), {
            status,
            headers: {
              "Content-Type": incoming.headers["content-type"] ?? "",
              Connection: incoming.headers.connection ?? "",
            },
          }),
        );
      });
    });
  });
  const uploading = async () => {
    for (let sent = 0; sent < BODY_SIZE; sent += CHUNK.byteLength) {
      await new Promise<void>((resolve, reject) => {
        client.write(CHUNK, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      await pause(50);
    }
    client.end();
  };
  const [, response] = await Promise.all([uploading(), received]);
  return response;
}

describe("HTTP 본문 한도", () => {
  it.each([true, false])(
    "느린 2 MiB 업로드도 413 문서를 받는다(Content-Length: %s)",
    async (length) => {
      const { app } = echoApp();
      const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
      onTestFinished(
        () =>
          new Promise<void>((resolve) =>
            server.close(() => {
              resolve();
            }),
          ),
      );
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      const response = await slowUpload(`http://127.0.0.1:${String(port)}/api/v1/echo`, length);
      expect(await errorsOf(response, 413)).toEqual([
        {
          status: "413",
          code: "jsonapi.content_too_large",
          title: "Content Too Large",
          detail: "The request body must be at most 1048576 bytes.",
        },
      ]);
      expect(response.headers.get("connection")).not.toBe("close");
    },
  );
});
