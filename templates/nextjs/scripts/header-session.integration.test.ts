import { appOrigin } from "../src/lib/app-config.mjs";
import { appSessionCookieName } from "../src/lib/app-config.mjs";
import { afterEach, beforeEach, expect, inject, it, vi } from "vitest";
import { getHeaderUser } from "../src/lib/session/user";
import { sealSession } from "../src/lib/session/cookie";
import { EXAMPLE_SESSION_SECRET } from "../src/lib/env";
import { ApiError } from "../src/lib/api/errors";
import { login } from "./test/session";

const { jar } = vi.hoisted(() => ({ jar: new Map<string, { value: string }>() }));
// Next 요청 저장소 경계만 대체하고 인증과 /me는 실제 목에서 실행한다.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => jar.get(name) }),
}));
beforeEach(() => {
  jar.clear();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", appOrigin("dev"));
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
});
afterEach(() => vi.unstubAllEnvs());

it("쿠키가 없으면 API 없이 익명 헤더를 만든다", async () => {
  vi.stubEnv("API_BASE_URL", "http://127.0.0.1:1/api/v1");
  expect(await getHeaderUser("ko")).toBeNull();
});
it("실제 세션으로 이름만 가져오고 토큰은 UI에 넘기지 않는다", async () => {
  jar.set(appSessionCookieName("development"), { value: await sealSession(await login()) });
  expect(await getHeaderUser("en")).toEqual({ name: "Admin" });
});
it("거절된 access 토큰은 갱신 없이 쿠키 정리 흐름으로 보낸다", async () => {
  jar.set(appSessionCookieName("development"), {
    value: await sealSession({ ...(await login()), accessToken: "rejected" }),
  });
  await expect(getHeaderUser("en")).rejects.toMatchObject({
    digest: "NEXT_REDIRECT;replace;/session/clear?returnTo=%2Fen;307;",
  });
});
it("API trace는 Next가 운영에서 직렬화하는 digest에도 보존한다", () => {
  const error = new ApiError({
    status: 500,
    traceId: "0123456789abcdef0123456789abcdef",
    errors: [],
  });
  expect(error).toMatchObject({ digest: "0123456789abcdef0123456789abcdef" });
});
