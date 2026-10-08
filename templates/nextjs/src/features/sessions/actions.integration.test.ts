import { ko, en } from "../../lib/i18n/catalogs";
import { afterEach, beforeAll, beforeEach, expect, inject, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createTranslator } from "next-intl";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { readSession } from "../../lib/session/request";
import { sessionsFixture } from "./test-fixture";
import { getSessions } from "./queries";
import {
  revokeSessionAction,
  revokeListedSessionAction,
  revokeOthersAction,
  revokeAllAction,
} from "./actions";

const request = vi.hoisted(() => ({ locale: "ko", setCookie: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: request.setCookie }) }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: async () => request.locale,
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: "ko" | "en";
    namespace: "sessions" | "errors";
  }) => createTranslator({ locale, messages: locale === "ko" ? ko : en, namespace }),
}));
vi.mock("../../lib/session/request", async (original) => ({
  ...(await original<typeof import("../../lib/session/request")>()),
  readSession: vi.fn(),
}));
const initial = { ok: true } as const;
function confirmed() {
  const data = new FormData();
  data.set("confirm", "on");
  return data;
}
let owner: Awaited<ReturnType<typeof sessionsFixture>>;
beforeAll(() => {
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", inject("httpBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
});
beforeEach(async () => {
  owner = await sessionsFixture();
  vi.mocked(readSession).mockResolvedValue(owner.session);
  vi.mocked(revalidatePath).mockClear();
  request.setCookie.mockClear();
  request.locale = "ko";
});
afterEach(async () => {
  await owner?.stop();
});

it("선택 순번은 서버에 바인딩한 세션 id로 해석하고 폼의 다른 id는 사용하지 않는다", async () => {
  const second = await owner.login();
  const data = new FormData();
  data.set("sessionIndex", "0");
  data.set("id", owner.id);
  expect(await revokeListedSessionAction([second.id], initial, data)).toEqual({
    ok: true,
    revokedCount: 1,
  });
  await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  expect((await owner.client.GET("/me")).response.status).toBe(200);
});
it.each([undefined, "", "-1", "999", "1.5", "abc"])(
  "잘못된 선택 순번 %j는 세션을 폐기하지 않고 번역 안내를 반환한다",
  async (index) => {
    request.locale = "en";
    const second = await owner.login();
    const data = new FormData();
    if (index !== undefined) data.set("sessionIndex", index);
    expect(await revokeListedSessionAction([second.id], initial, data)).toEqual({
      ok: false,
      formError: "The requested resource was not found.",
      fieldErrors: {},
    });
    expect((await second.client.GET("/me")).response.status).toBe(200);
    expect((await owner.client.GET("/me")).response.status).toBe(200);
    expect(revalidatePath).not.toHaveBeenCalled();
  },
);
it("두 실제 활성 세션과 현재 표시를 읽고 토큰·사용자 관계를 화면 데이터에서 제외한다", async () => {
  const second = await owner.login("Other device");
  const page = await getSessions("ko");
  expect(page.items).toHaveLength(2);
  expect(page.items.find((item) => item.id === owner.id)).toMatchObject({
    current: true,
    userAgent: "Current device",
  });
  expect(page.items.find((item) => item.id === second.id)).toMatchObject({
    current: false,
    userAgent: "Other device",
  });
  expect(JSON.stringify(page)).not.toContain(owner.session.accessToken);
  expect(JSON.stringify(page)).not.toContain("relationships");
});
it("활성 세션의 다음·이전 페이지를 web 경로로 바꾼다", async () => {
  for (let index = 0; index < 10; index++) await owner.login();
  const first = await getSessions("en", 1);
  expect(first.items).toHaveLength(10);
  expect(first.previous).toBeNull();
  expect(first.next).toBe("/me/sessions?page=2");
  const second = await getSessions("en", 2);
  expect(second.items).toHaveLength(1);
  expect(second.previous).toBe("/me/sessions?page=1");
  expect(second.next).toBeNull();
});
it("다른 세션 하나를 폐기하면 그 access·refresh는 401이고 현재 세션은 유지된다", async () => {
  const second = await owner.login();
  expect(await revokeSessionAction(second.id, initial, new FormData())).toEqual({
    ok: true,
    revokedCount: 1,
  });
  await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  await expect(
    second.client.POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "refreshToken", refreshToken: second.session.refreshToken },
        },
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect((await owner.client.GET("/me")).response.status).toBe(200);
  expect((await getSessions("ko")).items.map((item) => item.id)).toEqual([owner.id]);
  expect(revalidatePath).toHaveBeenCalledWith("/[locale]/me/sessions", "page");
  expect(request.setCookie).not.toHaveBeenCalled();
});
it.each(["ko", "en"] as const)(
  "%s 폐기 뒤 본인 조회의 요청 한도는 번역·재시도 안내와 목록 갱신으로 처리한다",
  async (locale) => {
    request.locale = locale;
    const second = await owner.login();
    const actual = globalThis.fetch;
    let deleted = false;
    // DELETE는 실제 목에 보내고 후속 GET /me에만 HTTP 429를 주입한다.
    const failing = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (
        input instanceof Request &&
        input.method === "GET" &&
        new URL(input.url).pathname === "/api/v1/me" &&
        deleted
      ) {
        deleted = false;
        return new Response(
          JSON.stringify({ errors: [{ status: "429", code: "rate_limit.exceeded" }] }),
          {
            status: 429,
            headers: { "Content-Type": "application/vnd.api+json", "Retry-After": "9" },
          },
        );
      }
      const response = await actual(input, init);
      if (input instanceof Request && input.method === "DELETE" && response.ok) deleted = true;
      return response;
    });
    try {
      expect(await revokeSessionAction(second.id, initial, new FormData())).toEqual({
        ok: false,
        formError:
          locale === "ko"
            ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
            : "Too many requests. Try again later.",
        fieldErrors: {},
        retryAfter: 9,
      });
      expect(revalidatePath).toHaveBeenCalledWith("/[locale]/me/sessions", "page");
      expect(request.setCookie).not.toHaveBeenCalled();
    } finally {
      failing.mockRestore();
    }
    await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    expect((await owner.client.GET("/me")).response.status).toBe(200);
    expect((await getSessions(locale)).items.map((item) => item.id)).toEqual([owner.id]);
  },
);
it("다른 기기 로그아웃은 실제 폐기 개수를 표시하고 현재 세션·refresh를 보존한다", async () => {
  const second = await owner.login();
  const third = await owner.login();
  expect(await revokeOthersAction(initial, new FormData())).toEqual({ ok: true, revokedCount: 2 });
  for (const login of [second, third])
    await expect(login.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  expect(await revokeOthersAction(initial, new FormData())).toEqual({ ok: true, revokedCount: 0 });
  expect(
    (
      await owner.client.POST("/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: { grantType: "refreshToken", refreshToken: owner.session.refreshToken },
          },
        },
      })
    ).response.status,
  ).toBe(201);
  expect(request.setCookie).not.toHaveBeenCalled();
});
it.each(["ko", "en"] as const)(
  "%s 현재 세션 하나 폐기는 쿠키를 지우고 로그인으로 이동한다",
  async (locale) => {
    request.locale = locale;
    const second = await owner.login();
    await expect(revokeSessionAction(owner.id, initial, new FormData())).rejects.toThrow(
      locale === "ko"
        ? "redirect:/login?returnTo=%2Fme%2Fsessions"
        : "redirect:/en/login?returnTo=%2Fen%2Fme%2Fsessions",
    );
    expect(request.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ value: "", maxAge: 0 }),
    );
    await expect(owner.client.GET("/me")).rejects.toMatchObject({ status: 401 });
    expect((await second.client.GET("/me")).response.status).toBe(200);
  },
);
it("전체 로그아웃은 두 세션 모두 폐기하고 쿠키를 지운다", async () => {
  request.locale = "en";
  const second = await owner.login();
  await expect(revokeAllAction(initial, confirmed())).rejects.toThrow(
    "redirect:/en/login?returnTo=%2Fen%2Fme%2Fsessions",
  );
  for (const login of [owner, second])
    await expect(login.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  expect(request.setCookie).toHaveBeenCalledWith(expect.objectContaining({ value: "", maxAge: 0 }));
});
it("이미 폐기한 세션과 남의 세션은 번역된 404 안내이며 현재 세션을 유지한다", async () => {
  const second = await owner.login();
  await revokeSessionAction(second.id, initial, new FormData());
  const other = await sessionsFixture();
  try {
    for (const id of [second.id, other.id])
      expect(await revokeSessionAction(id, initial, new FormData())).toMatchObject({
        ok: false,
        formError: expect.any(String),
        fieldErrors: {},
      });
    expect((await owner.client.GET("/me")).response.status).toBe(200);
    expect((await other.client.GET("/me")).response.status).toBe(200);
    expect(request.setCookie).not.toHaveBeenCalled();
  } finally {
    await other.stop();
  }
});
it("전체 로그아웃 확인이 없으면 세션을 폐기하지 않고 안내한다", async () => {
  expect(await revokeAllAction(initial, new FormData())).toMatchObject({
    ok: false,
    formError: expect.any(String),
    fieldErrors: {},
  });
  expect((await owner.client.GET("/me")).response.status).toBe(200);
  expect(request.setCookie).not.toHaveBeenCalled();
});
it("폐기된 토큰의 조회와 모든 Action은 쿠키 정리 경로로 이동한다", async () => {
  const second = await owner.login();
  await owner.client.DELETE("/sessions/{id}", { params: { path: { id: second.id } } });
  vi.mocked(readSession).mockResolvedValue(second.session);
  request.locale = "en";
  for (const operation of [
    () => getSessions("en"),
    () => revokeSessionAction(owner.id, initial, new FormData()),
    () => revokeOthersAction(initial, new FormData()),
    () => revokeAllAction(initial, confirmed()),
  ])
    await expect(operation()).rejects.toThrow(
      "redirect:/session/clear?returnTo=%2Fen%2Fme%2Fsessions",
    );
});
it("연결 실패는 폼 오류로 숨기지 않는다", async () => {
  const failing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    for (const operation of [
      () => getSessions("ko"),
      () => revokeSessionAction(owner.id, initial, new FormData()),
      () => revokeOthersAction(initial, new FormData()),
      () => revokeAllAction(initial, confirmed()),
    ])
      await expect(operation()).rejects.toMatchObject({ status: 0 });
  } finally {
    failing.mockRestore();
  }
});
