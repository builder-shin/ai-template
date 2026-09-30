/** 헬스체크: 계약의 HealthReport를 application/json으로 준다. */

import { describe, expect, it } from "vitest";
import { testApp } from "./support.ts";

describe("헬스체크", () => {
  it.each(["/health/live", "/health/ready"])("%s는 200 HealthReport다", async (path) => {
    const { app } = testApp();
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ status: "ok", checks: {} });
  });
});
