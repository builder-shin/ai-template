import { afterEach, expect, it, vi } from "vitest";
import { createPlan } from "../../src/web-e2e/plan.ts";
import { smoke, waitForServices } from "../../src/web-e2e/smoke.ts";

afterEach(() => vi.unstubAllGlobals());

it.each(["web", "admin"] as const)("대상별 준비와 smoke는 전용 주소만 읽는다 (%s)", async (app) => {
  const plan = createPlan("offline-smoke", undefined, app);
  const origin = app === "web" ? "http://localhost:3100" : "http://localhost:3101";
  const api = app === "web" ? "http://127.0.0.1:18100" : "http://127.0.0.1:18101";
  const mail = app === "web" ? "http://127.0.0.1:28125" : "http://127.0.0.1:28126";
  const s3 = app === "web" ? "http://127.0.0.1:28433" : "http://127.0.0.1:28434";
  const urls: string[] = [];
  function response(url: string, options: RequestInit): Response {
    urls.push(url);
    if (
      url === `${api}/health/ready` ||
      url === `${mail}/readyz` ||
      (app === "web" && url === "http://127.0.0.1:28180/default/.well-known/openid-configuration")
    )
      return new Response("ready");
    if (url === `${api}/api/v1/posts`)
      return Response.json({ data: [{ id: "one" }, { id: "two" }] });
    if (url === `${s3}/app/smoke`) {
      expect(new Headers(options.headers).get("Origin")).toBe(origin);
      return new Response(null, {
        headers: { "access-control-allow-origin": origin, "access-control-allow-methods": "PUT" },
      });
    }
    if (url === `${api}/api/v1/registrations`) return new Response(null, { status: 201 });
    if (url.startsWith(`${mail}/api/v1/search?`))
      return Response.json({ messages: [{ ID: "mail-one" }] });
    if (url === `${mail}/api/v1/message/mail-one`)
      return Response.json({ Text: `${origin}/verify-email?token=smoke` });
    throw new Error(`전용 주소 밖 요청: ${url}`);
  }
  vi.stubGlobal("fetch", (url: string, options: RequestInit) =>
    Promise.resolve(response(url, options)),
  );
  await waitForServices(plan);
  expect(await smoke(plan)).toBe(0);
  expect(urls).toContain(`${mail}/api/v1/message/mail-one`);
  if (app === "admin") expect(urls.some((url) => url.includes("28180"))).toBe(false);
});
