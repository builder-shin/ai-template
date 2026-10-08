/** JSON:API 1.1 콘텐츠 협상: 415와 406. FastAPI 템플릿의 test_negotiation.py와 같은 입력을 쓴다. */

import { describe, expect, it } from "vitest";
import { JSONAPI_MEDIA_TYPE } from "../src/jsonapi/media.ts";
import {
  acceptAcceptable,
  contentTypeSupported,
  parseMediaType,
} from "../src/jsonapi/negotiation.ts";
import { codesOf, echoApp, errorsOf } from "./support.ts";

const ECHO = "http://mock.test/api/v1/echo";
const NOT_JSON = new TextEncoder().encode("{not json");

describe("415 jsonapi.unsupported_media_type", () => {
  it.each([
    [undefined],
    ["application/json"],
    ["text/plain"],
    ["application/vnd.api+json; charset=utf-8"],
    ['application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"'],
    ['application/vnd.api+json; profile="https://example.com/p"; foo=bar'],
  ])("본문을 받는 요청의 Content-Type이 %s이면 415다", async (contentType) => {
    const { app } = echoApp();
    const headers = contentType === undefined ? {} : { "Content-Type": contentType };
    const response = await app.request(ECHO, { method: "POST", body: NOT_JSON, headers });
    const errors = await errorsOf(response, 415);
    expect(errors).toEqual([
      {
        status: "415",
        code: "jsonapi.unsupported_media_type",
        title: "Unsupported Media Type",
        detail:
          "Content-Type must be application/vnd.api+json without parameters other than profile.",
      },
    ]);
  });

  it("PATCH와 PUT도 본다. GET과 DELETE는 Content-Type을 보지 않는다", async () => {
    const { app } = echoApp();
    for (const method of ["PATCH", "PUT"]) {
      const response = await app.request(ECHO, { method, body: NOT_JSON });
      expect(await codesOf(response, 415)).toEqual(["jsonapi.unsupported_media_type"]);
    }
    expect((await app.request(ECHO, { headers: { "Content-Type": "text/plain" } })).status).toBe(
      200,
    );
    const deleted = await app.request(ECHO, { method: "DELETE" });
    expect(await codesOf(deleted, 404)).toEqual(["resource.not_found"]);
  });

  it("profile 매개변수는 허용한다", async () => {
    const { app } = echoApp();
    const response = await app.request(ECHO, {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": `${JSONAPI_MEDIA_TYPE}; profile="https://example.com/p"` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ size: 2 });
  });

  it("415가 406보다 먼저다", async () => {
    const { app } = echoApp();
    const response = await app.request(ECHO, {
      method: "POST",
      body: NOT_JSON,
      headers: { Accept: `${JSONAPI_MEDIA_TYPE}; foo=bar` },
    });
    expect(await codesOf(response, 415)).toEqual(["jsonapi.unsupported_media_type"]);
  });
});

describe("406 jsonapi.not_acceptable", () => {
  it.each([
    ["application/vnd.api+json; foo=bar"],
    ['application/vnd.api+json; ext="https://jsonapi.org/ext/atomic"'],
    ["application/vnd.api+json; foo=bar, application/vnd.api+json; charset=utf-8"],
  ])("JSON:API 인스턴스마다 profile 밖의 매개변수가 붙은 Accept(%s)는 406이다", async (accept) => {
    const { app } = echoApp();
    const response = await app.request(ECHO, { headers: { Accept: accept } });
    expect(await errorsOf(response, 406)).toEqual([
      {
        status: "406",
        code: "jsonapi.not_acceptable",
        title: "Not Acceptable",
        detail: "Accept must allow application/vnd.api+json without parameters other than profile.",
      },
    ]);
  });

  it.each([
    [undefined],
    ["*/*"],
    ["application/json"],
    ["application/vnd.api+json"],
    ["application/vnd.api+json;q=0.5"],
    ['application/vnd.api+json; profile="https://example.com/p"'],
    ["application/vnd.api+json; foo=bar, application/vnd.api+json"],
    ["text/html, */*;q=0.1"],
  ])("Accept가 %s이면 통과한다", async (accept) => {
    const { app } = echoApp();
    const headers = accept === undefined ? {} : { Accept: accept };
    expect((await app.request(ECHO, { headers })).status).toBe(200);
  });

  it("없는 경로에도 협상이 먼저다", async () => {
    const { app } = echoApp();
    const response = await app.request("/api/v1/does-not-exist", {
      headers: { Accept: `${JSONAPI_MEDIA_TYPE}; ext="https://example.com/ext"` },
    });
    expect(await codesOf(response, 406)).toEqual(["jsonapi.not_acceptable"]);
  });
});

describe("협상의 범위와 해석", () => {
  it("/api/ 밖(헬스체크)은 협상하지 않는다", async () => {
    const { app } = echoApp();
    const response = await app.request("/health/live", {
      headers: { Accept: `${JSONAPI_MEDIA_TYPE}; foo=bar` },
    });
    expect(response.status).toBe(200);
  });

  it("따옴표 안의 구분자와 q 뒤의 accept-ext를 매개변수로 보지 않는다", () => {
    const parsed = parseMediaType('application/vnd.api+json; profile="a;b, c"; q=0.3; ext');
    expect(parsed.type).toBe(JSONAPI_MEDIA_TYPE);
    expect([...parsed.parameters]).toEqual(["profile"]);
    expect(contentTypeSupported("Application/VND.API+JSON")).toBe(true);
    expect(contentTypeSupported("application/vnd.api+json;charset=utf-8")).toBe(false);
    expect(contentTypeSupported(undefined)).toBe(false);
    expect(acceptAcceptable('application/vnd.api+json; profile="x, y"')).toBe(true);
  });
});
