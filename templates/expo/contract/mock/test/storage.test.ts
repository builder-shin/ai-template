/**
 * 가짜 스토리지(/_storage): presigned PUT·GET, 서명(메서드, 키, 만료, 업로드의 타입과 크기), 만료,
 * S3 에러 문서, CORS. FastAPI 템플릿이 SeaweedFS에 SigV4로 presign한 요청과 같게 받고 거절한다.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { MINUTE, SECOND } from "../src/core/clock.ts";
import type { PresignedRequest } from "../src/storage/bucket.ts";
import { testApp, testClock } from "./support.ts";
import { PNG } from "./uploads.ts";

const BASE = DEFAULT_CONFIG.apiUrl;
const KEY = "files/0199a0b2-8c3e-7abc-8def-0123456789ab";
const UPLOAD = { contentType: "image/png", size: PNG.byteLength };

type App = ReturnType<typeof testApp>["app"];

function put(
  app: App,
  url: string,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = { "Content-Type": "image/png" },
): Promise<Response> {
  const init = {
    method: "PUT",
    body,
    headers: { ...headers, "Content-Length": String(body.byteLength) },
  };
  return Promise.resolve(app.request(url, init));
}

function get(app: App, url: string, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(app.request(url, { headers }));
}

/** S3 XML 에러 문서의 코드. */
async function s3Code(response: Response, status: number): Promise<string | undefined> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/xml");
  return /<Code>([^<]+)<\/Code>/.exec(await response.text())?.[1];
}

function withQuery(request: PresignedRequest, name: string, value: string): string {
  const url = new URL(request.url);
  url.searchParams.set(name, value);
  return url.toString();
}

describe("presigned 요청", () => {
  it("PUT URL로 올리고 GET URL로 내려받는다", async () => {
    const { app, state } = testApp();
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    expect(upload.url).toMatch(
      /^http:\/\/localhost:4010\/_storage\/files\/[0-9a-f-]{36}\?expires=\d+&signature=[0-9a-f]{64}$/,
    );
    expect(upload.headers).toEqual({ "Content-Type": "image/png" });
    const md5 = `"${createHash("md5").update(PNG).digest("hex")}"`;
    const stored = await put(app, upload.url, PNG);
    expect([stored.status, await stored.text()]).toEqual([200, ""]);
    expect(stored.headers.get("etag")).toBe(md5);
    expect(state.storage.size(KEY)).toBe(PNG.byteLength);
    const download = state.storage.presignDownload(BASE, KEY, 10 * MINUTE);
    expect(download.headers).toEqual({});
    const response = await get(app, download.url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("etag")).toBe(md5);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it("서명과 다른 타입이나 크기, 바꾼 URL은 403 SignatureDoesNotMatch이고 연결을 닫는다", async () => {
    const { app, state } = testApp();
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    const larger = new Uint8Array(PNG.byteLength + 1);
    const attempts = [
      put(app, upload.url, PNG, { "Content-Type": "image/gif" }),
      put(app, upload.url, PNG, {}),
      put(app, upload.url, larger),
      put(app, upload.url.replace(KEY, "files/other"), PNG),
      put(app, withQuery(upload, "expires", "9999999999"), PNG),
      put(app, withQuery(upload, "signature", "0".repeat(64)), PNG),
      put(app, upload.url.split("?")[0] ?? "", PNG),
      Promise.resolve(
        app.request(upload.url, { method: "PUT", body: PNG, headers: upload.headers }),
      ),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.headers.get("connection")).toBe("close");
      expect(await s3Code(response, 403)).toBe("SignatureDoesNotMatch");
    }
    expect(state.storage.size(KEY)).toBeUndefined();
  });

  it("GET URL로는 올리지 못하고 PUT URL로는 내려받지 못한다. 없는 객체는 404 NoSuchKey다", async () => {
    const { app, state } = testApp();
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    const download = state.storage.presignDownload(BASE, KEY, 10 * MINUTE);
    expect(await s3Code(await put(app, download.url, PNG), 403)).toBe("SignatureDoesNotMatch");
    expect(await s3Code(await get(app, upload.url), 403)).toBe("SignatureDoesNotMatch");
    const missing = await get(app, download.url);
    expect(await missing.clone().text()).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        "<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>",
    );
    expect(await s3Code(missing, 404)).toBe("NoSuchKey");
  });

  it("만료가 지난 URL은 403 AccessDenied다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    const download = state.storage.presignDownload(BASE, KEY, 10 * MINUTE);
    clock.advance(10 * MINUTE + SECOND);
    const expired = await get(app, download.url);
    expect(await expired.clone().text()).toContain("<Message>Request has expired.</Message>");
    expect(await s3Code(expired, 403)).toBe("AccessDenied");
    expect((await put(app, upload.url, PNG)).status).toBe(200);
    clock.advance(5 * MINUTE);
    expect(await s3Code(await put(app, upload.url, PNG), 403)).toBe("AccessDenied");
  });
});

describe("CORS", () => {
  const preflight = (origin: string) => ({
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  it("허용한 Origin의 preflight와 요청에 CORS 헤더를 준다", async () => {
    const { app, state } = testApp();
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    const answered = await app.request(upload.url, preflight("http://localhost:3000"));
    expect(answered.status).toBe(204);
    expect(Object.fromEntries(answered.headers)).toMatchObject({
      "access-control-allow-origin": "http://localhost:3000",
      "access-control-allow-methods": "GET,PUT,HEAD",
      "access-control-allow-headers": "content-type",
      "access-control-expose-headers": "ETag",
      "access-control-max-age": "3000",
    });
    const origin = { Origin: "http://localhost:3001", "Content-Type": "image/png" };
    const stored = await put(app, upload.url, PNG, origin);
    expect(stored.status).toBe(200);
    expect(stored.headers.get("access-control-allow-origin")).toBe("http://localhost:3001");
    expect(stored.headers.get("access-control-expose-headers")).toBe("ETag");
    expect(stored.headers.get("vary")).toBe("Origin");
    const wrongType = { Origin: "http://localhost:3000", "Content-Type": "image/gif" };
    const refused = await put(app, upload.url, PNG, wrongType);
    expect(refused.status).toBe(403);
    expect(refused.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("허용하지 않은 Origin에는 CORS 헤더가 없고, 허용 목록은 설정으로 바꾼다", async () => {
    const { app, state } = testApp({ storageAllowedOrigins: ["https://web.example.com"] });
    const upload = state.storage.presignUpload(BASE, KEY, UPLOAD, 15 * MINUTE);
    const refused = await app.request(upload.url, preflight("http://localhost:3000"));
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
    const allowed = await app.request(upload.url, preflight("https://web.example.com"));
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://web.example.com");
  });
});
