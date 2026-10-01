import { afterAll, beforeAll, beforeEach, expect, inject, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { readSession } from "../../lib/session/request";
import { getHeaderUser } from "../../lib/session/user";
import { ApiError } from "../../lib/api/errors";
import { profileFixture } from "./test-fixture";
import { updateProfileAction, changePasswordAction } from "./actions";
import { getProfile } from "./queries";

const request = vi.hoisted(() => ({ locale: "ko", setCookie: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: request.setCookie }) }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => request.locale }));
vi.mock("../../lib/session/request", async (original) => ({
  ...(await original<typeof import("../../lib/session/request")>()),
  readSession: vi.fn(),
}));
const initial = { ok: true } as const;
function fields(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, value);
  return data;
}
let owner: Awaited<ReturnType<typeof profileFixture>>;
let other: Awaited<ReturnType<typeof profileFixture>>;
beforeAll(async () => {
  vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
  vi.stubEnv("APP_URL", inject("httpBaseUrl"));
  vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
  vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
  owner = await profileFixture();
  other = await profileFixture();
});
beforeEach(() => {
  vi.mocked(readSession).mockResolvedValue(owner.session);
  vi.mocked(revalidatePath).mockClear();
  request.setCookie.mockClear();
  request.locale = "ko";
});
afterAll(async () => {
  await owner?.stop();
  await other?.stop();
  vi.unstubAllEnvs();
});

it("이름을 저장하고 헤더와 아바타 없는 프로필을 다시 읽는다", async () => {
  expect(await updateProfileAction(initial, fields({ name: "새 이름", locale: "ko" }))).toEqual({
    ok: true,
    saved: true,
  });
  expect(await getProfile("ko")).toMatchObject({
    name: "새 이름",
    locale: "ko",
    avatar: { id: "", url: "" },
  });
  expect(await getHeaderUser("ko")).toEqual({ name: "새 이름" });
  expect(revalidatePath).toHaveBeenCalledWith("/[locale]", "layout");
});
it("로케일 저장은 계정·NEXT_LOCALE·ko/en URL을 함께 맞춘다", async () => {
  await expect(
    updateProfileAction(initial, fields({ name: "English name", locale: "en" })),
  ).rejects.toThrow("redirect:/en/me");
  expect((await owner.client.GET("/me")).data!.data.attributes.locale).toBe("en");
  expect(request.setCookie).toHaveBeenLastCalledWith({
    name: "NEXT_LOCALE",
    value: "en",
    path: "/",
    sameSite: "lax",
  });
  request.locale = "en";
  await expect(
    updateProfileAction(initial, fields({ name: "한국 이름", locale: "ko" })),
  ).rejects.toThrow("redirect:/me");
  expect((await owner.client.GET("/me")).data!.data.attributes.locale).toBe("ko");
  expect(request.setCookie).toHaveBeenLastCalledWith(expect.objectContaining({ value: "ko" }));
});
it("ready 아바타를 연결·보존·해제하고 include의 다운로드 URL을 읽는다", async () => {
  const id = await owner.image();
  expect(
    await updateProfileAction(initial, fields({ name: "아바타", locale: "ko", avatar: id })),
  ).toMatchObject({ ok: true });
  const profile = await getProfile("en");
  expect(profile.avatar.id).toBe(id);
  expect(profile.avatar.url).toContain("/_storage/");
  const image = await fetch(profile.avatar.url);
  expect(image.status).toBe(200);
  expect(image.headers.get("content-type")).toBe("image/png");
  await updateProfileAction(initial, fields({ name: "보존", locale: "ko" }));
  expect((await getProfile("ko")).avatar.id).toBe(id);
  await updateProfileAction(initial, fields({ name: "해제", locale: "ko", avatar: "" }));
  expect((await getProfile("ko")).avatar).toEqual({ id: "", url: "" });
});
it("이름·로케일 pointer 오류와 관계 오류를 번역하고 입력을 보존한다", async () => {
  const invalid = { name: "", locale: "fr", avatar: "" };
  expect(await updateProfileAction(initial, fields(invalid))).toMatchObject({
    ok: false,
    fieldErrors: { name: [expect.any(String)], locale: [expect.any(String)] },
    values: invalid,
  });
  for (const id of [await owner.image(false), await other.image()]) {
    expect(
      await updateProfileAction(initial, fields({ name: "남길 이름", locale: "ko", avatar: id })),
    ).toMatchObject({
      ok: false,
      formError: expect.any(String),
      fieldErrors: {},
      values: { name: "남길 이름", locale: "ko", avatar: id },
    });
  }
  expect(request.setCookie).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});
it("틀린 현재 비밀번호의 401은 입력칸 오류이며 현재 세션을 보존한다", async () => {
  const result = await changePasswordAction(
    initial,
    fields({ currentPassword: "wrong-password", newPassword: "new-test-password" }), // betterleaks:allow 사유: 테스트 비밀번호
  );
  expect(result).toMatchObject({
    ok: false,
    fieldErrors: { currentPassword: [expect.any(String)] },
    formError: null,
  });
  expect(JSON.stringify(result)).not.toContain("wrong-password");
  expect((await owner.client.GET("/me")).response.status).toBe(200);
  expect(request.setCookie).not.toHaveBeenCalled();
});
it("짧은 새 비밀번호는 pointer 오류이며 비밀번호를 결과에 돌려주지 않는다", async () => {
  const result = await changePasswordAction(
    initial,
    fields({ currentPassword: owner.password, newPassword: "short" }), // betterleaks:allow 사유: 길이 검증용 테스트 값
  );
  expect(result).toMatchObject({ ok: false, fieldErrors: { newPassword: [expect.any(String)] } });
  expect(JSON.stringify(result)).not.toContain(owner.password);
});
it("변경 후 다른 세션은 401, 현재 토큰과 refresh는 유효하고 새 비밀번호로 로그인한다", async () => {
  const second = await owner.login();
  const secret = "changed-profile-password"; // betterleaks:allow 사유: 테스트 비밀번호
  expect(
    await changePasswordAction(
      initial,
      fields({ currentPassword: owner.password, newPassword: secret }),
    ),
  ).toEqual({ ok: true, changed: true });
  expect((await owner.client.GET("/me")).response.status).toBe(200);
  await expect(second.client.GET("/me")).rejects.toMatchObject({ status: 401 });
  await expect(owner.login()).rejects.toMatchObject({
    status: 401,
    code: "auth.invalid_credentials",
  });
  const fresh = await owner.login(secret);
  expect((await fresh.client.GET("/me")).response.status).toBe(200);
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
it("비밀번호 변경 한도는 실제 429의 Retry-After를 폼 안내로 돌려준다", async () => {
  vi.mocked(readSession).mockResolvedValue(other.session);
  request.locale = "en";
  const data = fields({ currentPassword: "wrong-password", newPassword: "new-password" }); // betterleaks:allow 사유: 한도 검증용 테스트 값
  for (let attempt = 0; attempt < 5; attempt++) {
    expect(await changePasswordAction(initial, data)).toMatchObject({
      ok: false,
      fieldErrors: { currentPassword: [expect.any(String)] },
    });
  }
  expect(await changePasswordAction(initial, data)).toMatchObject({
    ok: false,
    formError: expect.any(String),
    fieldErrors: {},
    retryAfter: expect.any(Number),
  });
  expect((await other.client.GET("/me")).response.status).toBe(200);
  expect(request.setCookie).not.toHaveBeenCalled();
});
it("만료된 세션의 프로필·비밀번호 Action과 조회는 정리 route로 보낸다", async () => {
  vi.mocked(readSession).mockResolvedValue({
    ...owner.session,
    accessToken: "revoked-profile-session",
  });
  request.locale = "en";
  for (const operation of [
    () => updateProfileAction(initial, fields({ name: "이름", locale: "en" })),
    () =>
      changePasswordAction(
        initial,
        fields({ currentPassword: "old", newPassword: "new-password" }), // betterleaks:allow 사유: 만료 세션 테스트 값
      ),
    () => getProfile("en"),
  ])
    await expect(operation()).rejects.toThrow("redirect:/session/clear?returnTo=%2Fen%2Fme");
});
it("연결 오류를 폼 오류로 숨기지 않는다", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    await expect(
      updateProfileAction(initial, fields({ name: "이름", locale: "ko" })),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      changePasswordAction(
        initial,
        fields({ currentPassword: "old", newPassword: "new-password" }), // betterleaks:allow 사유: 연결 오류 테스트 값
      ),
    ).rejects.toBeInstanceOf(ApiError);
  } finally {
    vi.restoreAllMocks();
  }
});
