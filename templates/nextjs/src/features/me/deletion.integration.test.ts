import { ko, en } from "../../lib/i18n/catalogs";
import { setTimeout } from "node:timers/promises";
import { afterEach, beforeAll, beforeEach, expect, inject, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { createTranslator } from "next-intl";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { createApiClient } from "../../lib/api/client";
import { readSession } from "../../lib/session/request";
import { deleteAccountAction } from "./actions";
import { deletionFixture } from "./deletion-fixture";

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
  getTranslations: async ({ locale }: { locale: "ko" | "en" }) =>
    createTranslator({ locale, messages: locale === "ko" ? ko : en, namespace: "me.deletion" }),
}));
vi.mock("../../lib/session/request", async (original) => ({
  ...(await original<typeof import("../../lib/session/request")>()),
  readSession: vi.fn(),
}));
const initial = { ok: true } as const;
const confirmed = () => {
  const data = new FormData();
  data.set("confirm", "on");
  return data;
};
let owner: Awaited<ReturnType<typeof deletionFixture>>;
beforeAll(() => {
  vi.stubEnv("APP_URL", inject("httpBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("deletionMockBaseUrl"));
});
beforeEach(async () => {
  vi.stubEnv("API_BASE_URL", `${inject("deletionMockBaseUrl")}/api/v1`);
  owner = await deletionFixture();
  vi.mocked(readSession).mockResolvedValue(owner.session);
  vi.mocked(revalidatePath).mockClear();
  request.setCookie.mockClear();
  request.locale = "ko";
});
afterEach(async () => {
  await owner?.stop();
});
it.each(["ko", "en"] as const)(
  "%s 탈퇴는 모든 세션을 폐기하고 쿠키를 지워 홈으로 간다",
  async (locale) => {
    request.locale = locale;
    const second = await owner.login();
    await expect(deleteAccountAction(initial, confirmed())).rejects.toThrow(
      `redirect:${locale === "ko" ? "/" : "/en"}`,
    );
    owner.markDeleted();
    expect(request.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ value: "", maxAge: 0 }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]", "layout");
    for (const login of [owner, second]) {
      await expect(login.client.GET("/me")).rejects.toMatchObject({ status: 401 });
      await expect(
        login.client.POST("/sessions", {
          body: {
            data: {
              type: "sessions",
              attributes: {
                grantType: "refreshToken",
                refreshToken: login.session.refreshToken,
              },
            },
          },
        }),
      ).rejects.toMatchObject({ status: 401 });
    }
    await expect(owner.login()).rejects.toMatchObject({ code: "auth.invalid_credentials" });
  },
);
it.each(["ko", "en"] as const)(
  "%s 오래된 실제 세션은 재인증 안내·복귀 경로로 가고 새 로그인 후 탈퇴한다",
  async (locale) => {
    request.locale = locale;
    await setTimeout(2100);
    await expect(owner.client.DELETE("/me")).rejects.toMatchObject({
      status: 401,
      code: "auth.reauthentication_required",
    });
    await expect(deleteAccountAction(initial, confirmed())).rejects.toThrow(
      locale === "ko"
        ? "redirect:/login?returnTo=%2Fme%2Fdelete&notice=reauthentication"
        : "redirect:/en/login?returnTo=%2Fen%2Fme%2Fdelete&notice=reauthentication",
    );
    expect(request.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ value: "", maxAge: 0 }),
    );
    expect((await owner.client.GET("/me")).response.status).toBe(200);
    const fresh = await owner.login();
    vi.mocked(readSession).mockResolvedValue(fresh.session);
    await expect(deleteAccountAction(initial, confirmed())).rejects.toThrow(
      `redirect:${locale === "ko" ? "/" : "/en"}`,
    );
    owner.markDeleted();
  },
);
it("확인 값이 없으면 API를 부르지 않고 계정을 보존한다", async () => {
  expect(await deleteAccountAction(initial, new FormData())).toEqual({
    ok: false,
    formError: "탈퇴를 확인해 주세요.",
    fieldErrors: {},
  });
  expect((await owner.client.GET("/me")).response.status).toBe(200);
  expect(request.setCookie).not.toHaveBeenCalled();
});
it.each(["ko", "en"] as const)(
  "%s 마지막 관리자는 실제 422 안내를 받고 로그인 상태를 유지한다",
  async (locale) => {
    request.locale = locale;
    const anonymous = createApiClient({
      baseUrl: `${inject("deletionMockBaseUrl")}/api/v1`,
      locale,
      log: () => {},
    });
    const { data } = await anonymous.POST("/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: {
            grantType: "password",
            email: "admin@example.com",
            password: "admin-password", // betterleaks:allow 사유: 테스트 시드 비밀번호
          },
        },
      },
    });
    vi.mocked(readSession).mockResolvedValue(data!.data.attributes);
    const result = await deleteAccountAction(initial, confirmed());
    expect(result).toEqual({
      ok: false,
      formError: createTranslator({
        locale,
        messages: locale === "ko" ? ko : en,
        namespace: "errors",
      })("role.last_admin_protected"),
      fieldErrors: {},
      lastAdminProtected: true,
    });
    expect(request.setCookie).not.toHaveBeenCalled();
    const admin = createApiClient({
      baseUrl: `${inject("deletionMockBaseUrl")}/api/v1`,
      locale,
      accessToken: data!.data.attributes.accessToken,
      log: () => {},
    });
    expect((await admin.GET("/me")).response.status).toBe(200);
    await admin.DELETE("/sessions/current");
  },
);
it("폐기된 세션은 일반 401 정리 경로로 보낸다", async () => {
  await owner.client.DELETE("/sessions/current");
  await expect(deleteAccountAction(initial, confirmed())).rejects.toThrow(
    "redirect:/session/clear?returnTo=%2Fme%2Fdelete",
  );
});
it("연결 실패는 폼 안내로 숨기지 않는다", async () => {
  const failing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    await expect(deleteAccountAction(initial, confirmed())).rejects.toMatchObject({ status: 0 });
  } finally {
    failing.mockRestore();
  }
});
