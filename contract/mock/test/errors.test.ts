/**
 * 에러 문서: 없는 경로의 404, 예상하지 못한 예외의 500, ApiError의 모양과 헤더, 401의 challenge.
 * FastAPI 템플릿의 test_errors.py 가운데 공통 계층에 해당하는 경우를 본다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorObject } from "../src/jsonapi/errors.ts";
import { echoApp, errorsOf, testApp } from "./support.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("라우팅 에러", () => {
  it("/api/ 아래의 없는 경로는 404 resource.not_found 에러 문서다", async () => {
    const { app } = testApp();
    const errors = await errorsOf(await app.request("/api/v1/nope"), 404);
    expect(errors).toEqual([{ status: "404", code: "resource.not_found", title: "Not Found" }]);
  });

  it("/api/ 아래에서 허용하지 않은 메서드도 Allow 없는 404다", async () => {
    const { app } = echoApp();
    const response = await app.request("/api/v1/echo", { method: "DELETE" });
    const errors = await errorsOf(response, 404);
    expect(errors).toEqual([{ status: "404", code: "resource.not_found", title: "Not Found" }]);
    expect(response.headers.has("allow")).toBe(false);
  });

  it("/api/ 밖의 없는 경로는 FastAPI의 기본 형식이다", async () => {
    const { app } = testApp();
    const response = await app.request("/nope");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ detail: "Not Found" });
  });
});

describe("예외", () => {
  it("예상하지 못한 예외는 500 internal.unexpected이고 원인은 trace id와 함께 로그에만 남는다", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app } = testApp();
    app.get("/api/v1/boom", () => {
      throw new Error("boom");
    });
    const response = await app.request("/api/v1/boom");
    const body = (await response.clone().json()) as { meta: { traceId: string } };
    expect(await errorsOf(response, 500)).toEqual([
      { status: "500", code: "internal.unexpected", title: "Internal Server Error" },
    ]);
    expect(JSON.stringify(body)).not.toContain("boom");
    expect(logged).toHaveBeenCalledWith(
      `[mock] unexpected_error trace_id=${body.meta.traceId}`,
      expect.objectContaining({ message: "boom" }),
    );
  });

  it("ApiError는 그 상태, 코드, 위치, 변수, 헤더로 응답한다", async () => {
    const { app } = testApp();
    app.get("/api/v1/locked", () => {
      throw new ApiError(401, "auth.unauthenticated", undefined, {
        headers: { "WWW-Authenticate": "Bearer" },
      });
    });
    app.get("/api/v1/short", () => {
      throw new ApiError(422, "validation.too_short", "Too short.", {
        pointer: "/data/attributes/name",
        params: { min: 1 },
      });
    });
    const locked = await app.request("/api/v1/locked");
    expect(await errorsOf(locked, 401)).toEqual([
      { status: "401", code: "auth.unauthenticated", title: "Unauthorized" },
    ]);
    expect(locked.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(await app.request("/api/v1/short"), 422)).toEqual([
      {
        status: "422",
        code: "validation.too_short",
        title: "Unprocessable Content",
        detail: "Too short.",
        source: { pointer: "/data/attributes/name" },
        meta: { params: { min: 1 } },
      },
    ]);
  });

  it("401은 늘 WWW-Authenticate를 담는다: 없으면 Bearer를 더하고, 있으면(재인증의 step-up) 이름의 대소문자와 관계없이 그것만 둔다", async () => {
    const stepUp = 'Bearer error="insufficient_user_authentication", max_age=600';
    const cases: [ApiError, string | null][] = [
      [new ApiError(401, "auth.invalid_credentials"), "Bearer"],
      [
        new ApiError(401, "auth.reauthentication_required", undefined, {
          headers: { "WWW-Authenticate": stepUp },
        }),
        stepUp,
      ],
      [
        new ApiError(401, "auth.token_invalid", undefined, {
          headers: { "www-authenticate": stepUp },
        }),
        stepUp,
      ],
      [new ApiError(403, "permission.denied"), null],
    ];
    for (const [raised, challenge] of cases) {
      const { app } = testApp();
      app.get("/api/v1/guarded", () => {
        throw raised;
      });
      const response = await app.request("/api/v1/guarded");
      expect(response.status, raised.code).toBe(raised.status);
      expect(response.headers.get("www-authenticate"), raised.code).toBe(challenge);
    }
  });
});

describe("errorObject", () => {
  it("title은 Python HTTPStatus의 이유 문구이고, 값이 없는 멤버는 넣지 않는다", () => {
    expect(errorObject(413, "jsonapi.content_too_large")).toEqual({
      status: "413",
      code: "jsonapi.content_too_large",
      title: "Content Too Large",
    });
    expect(
      errorObject(400, "jsonapi.invalid_query", "Unknown.", { parameter: "sort", params: {} }),
    ).toEqual({
      status: "400",
      code: "jsonapi.invalid_query",
      title: "Bad Request",
      detail: "Unknown.",
      source: { parameter: "sort" },
    });
  });

  it("문서 전체를 가리키는 pointer는 빈 문자열이다", () => {
    expect(errorObject(400, "jsonapi.invalid_document", undefined, { pointer: "" }).source).toEqual(
      { pointer: "" },
    );
  });

  it("멤버는 status, code, title, detail, source, meta 순서다", () => {
    const object = errorObject(422, "validation.too_long", "Too long.", {
      params: { max: 50 },
      pointer: "/data/attributes/name",
    });
    expect(Object.keys(object)).toEqual(["status", "code", "title", "detail", "source", "meta"]);
  });
});
