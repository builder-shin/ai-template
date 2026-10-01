import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { ApiError } from "../../lib/api/errors";
import { readSession } from "../../lib/session/request";
import { myPostFixture } from "./my-post-fixture";
import { loginSeedAccount } from "../../lib/testing/account";
import { startMock } from "../../../scripts/test/mock-server";
import { getMyPost, getMyPosts } from "./queries";
import {
  createPostAction,
  updatePostAction,
  publishPostAction,
  unpublishPostAction,
  deletePostAction,
} from "./actions";
import { revalidatePath } from "next/cache";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("../../lib/session/request", async (original) => ({
  ...(await original<typeof import("../../lib/session/request")>()),
  readSession: vi.fn(),
}));
const initial = { ok: true } as const;
function fields(title: string, body = "**새 본문**") {
  const form = new FormData();
  form.set("title", title);
  form.set("body", body);
  return form;
}

describe("내 글 Action과 실제 목", () => {
  let owner: Awaited<ReturnType<typeof myPostFixture>>;
  let other: Awaited<ReturnType<typeof myPostFixture>>;
  beforeAll(async () => {
    vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
    vi.stubEnv("APP_URL", inject("httpBaseUrl"));
    vi.stubEnv("SESSION_SECRET", EXAMPLE_SESSION_SECRET);
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", inject("mockBaseUrl"));
    owner = await myPostFixture();
    other = await myPostFixture();
  });
  beforeEach(() => {
    vi.mocked(readSession).mockResolvedValue(owner.session);
    vi.mocked(revalidatePath).mockClear();
  });
  afterAll(async () => {
    await owner?.stop();
    await other?.stop();
    vi.unstubAllEnvs();
  });

  it("초안 작성·수정·발행·취소·삭제와 양쪽 로케일의 페이지 갱신", async () => {
    await expect(createPostAction(initial, fields(owner.prefix))).rejects.toThrow(
      /redirect:\/en\/my-posts\/.+\/edit/,
    );
    const created = (await getMyPosts("en")).posts.find((post) => post.title === owner.prefix)!;
    expect(created.status).toBe("draft");
    const id = created.id;
    expect(await getMyPost("ko", id)).toMatchObject({ title: owner.prefix, body: "**새 본문**" });
    await expect(
      updatePostAction(id, initial, fields(`${owner.prefix} 수정`, "수정 본문")),
    ).rejects.toThrow(`redirect:/en/my-posts/${id}/edit`);
    await expect(publishPostAction(id, initial, new FormData())).rejects.toThrow(
      `redirect:/en/my-posts/${id}/edit`,
    );
    expect(await getMyPost("en", id)).toMatchObject({
      status: "published",
      title: `${owner.prefix} 수정`,
      body: "수정 본문",
      publishedAt: expect.any(String),
    });
    expect((await getMyPosts("ko", "draft")).posts.map((post) => post.id)).not.toContain(id);
    expect((await getMyPosts("ko", "published")).posts.map((post) => post.id)).toContain(id);
    await expect(unpublishPostAction(id, initial, new FormData())).rejects.toThrow(
      `redirect:/en/my-posts/${id}/edit`,
    );
    expect(await getMyPost("en", id)).toMatchObject({ status: "draft", publishedAt: null });
    await expect(deletePostAction(id, initial, new FormData())).rejects.toThrow(
      "redirect:/en/my-posts",
    );
    expect(await getMyPost("en", id)).toBeNull();
    for (const prefix of ["", "/en"]) {
      for (const path of ["/posts", `/posts/${id}`, "/my-posts", `/my-posts/${id}/edit`])
        expect(revalidatePath).toHaveBeenCalledWith(`${prefix}${path}`);
    }
  });
  it("작성자 필터로 남의 글을 제외하고 페이지와 상태를 보존한다", async () => {
    const own = await owner.create();
    const foreign = await other.create("published");
    const list = await getMyPosts("ko", "draft", 1, 1);
    expect(list.posts).toHaveLength(1);
    expect(list.posts[0]?.id).toBe(own.id);
    expect(list.page.size).toBe(1);
    expect((await getMyPosts("en")).posts.map((post) => post.id)).not.toContain(foreign.id);
    expect(await getMyPost("en", foreign.id)).toBeNull();
    expect(await getMyPost("en", "invalid")).toBeNull();
  });
  it("실제 관리자도 내 글 목록과 상세에서는 다른 작성자의 글을 볼 수 없다", async () => {
    const admin = await loginSeedAccount({
      origin: inject("mockBaseUrl"),
      locale: "en",
      account: {
        email: "admin@example.com",
        password: "admin-password", // betterleaks:allow 사유: 테스트 시드
      },
    });
    const prefix = `admin-own-${randomUUID()}`;
    const own = (
      await admin.client.POST("/posts", {
        body: {
          data: { type: "posts", attributes: { title: prefix, body: "본문", status: "draft" } },
        },
      })
    ).data!.data;
    const foreign = await other.create("draft");
    try {
      expect((await admin.client.GET("/me")).data!.data.attributes.name).toBe("Admin");
      // 관리자 API가 읽을 수 있는 남의 초안도 내 글 화면에서는 제외한다.
      expect(
        (await admin.client.GET("/posts/{id}", { params: { path: { id: foreign.id } } })).data!.data
          .id,
      ).toBe(foreign.id);
      vi.mocked(readSession).mockResolvedValue(admin.session);
      const list = await getMyPosts("en", "all", 1, 100);
      expect(list.posts.map((post) => post.id)).toContain(own.id);
      expect(list.posts.map((post) => post.id)).not.toContain(foreign.id);
      expect(list.posts.every((post) => post.authorName === "Admin")).toBe(true);
      expect(await getMyPost("en", own.id)).toMatchObject({ id: own.id, title: prefix });
      expect(await getMyPost("en", foreign.id)).toBeNull();
    } finally {
      await admin.client.DELETE("/posts/{id}", { params: { path: { id: own.id } } });
      await admin.client.DELETE("/sessions/{id}", { params: { path: { id: admin.id } } });
    }
  });
  it("실제 낮은 한도의 429를 번역 안내와 retryAfter로 바꾸고 페이지를 갱신하지 않는다", async () => {
    const mock = await startMock({ env: { RATE_LIMIT_GLOBAL: "4" } });
    try {
      const limited = await myPostFixture("en", mock.base);
      vi.stubEnv("API_BASE_URL", `${mock.base}/api/v1`);
      vi.mocked(readSession).mockResolvedValue(limited.session);
      const actual = globalThis.fetch;
      let response: Response | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const result = await actual(input, init);
        if (
          input instanceof Request &&
          input.method === "POST" && // gen:feature: 그대로
          new URL(input.url).pathname === "/api/v1/posts" // gen:feature: 그대로
        )
          response = result.clone();
        return result;
      });
      const result = await createPostAction(initial, fields("한도 초과"));
      expect(response?.status).toBe(429);
      const retryAfter = Number(response!.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(result).toMatchObject({
        ok: false,
        formError: "Too many requests. Try again later.",
        retryAfter,
        values: { title: "한도 초과", body: "**새 본문**" },
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      vi.stubEnv("API_BASE_URL", `${inject("mockBaseUrl")}/api/v1`);
      await mock.stop();
    }
  });
  it("빈 제목의 pointer 오류를 입력칸에 연결하고 값을 보존한다", async () => {
    expect(await createPostAction(initial, fields("", "남길 본문"))).toMatchObject({
      ok: false,
      fieldErrors: { title: [expect.any(String)] },
      values: { title: "", body: "남길 본문" },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("남의 발행 글은 403, 초안과 없는 글은 404로 쓰기를 거절한다", async () => {
    for (const status of ["draft", "published"] as const) {
      const foreign = await other.create(status);
      const message =
        status === "draft"
          ? "The requested resource was not found."
          : "You do not have permission to do this.";
      for (const result of [
        await updatePostAction(foreign.id, initial, fields("공격")),
        await publishPostAction(foreign.id, initial, new FormData()),
        await unpublishPostAction(foreign.id, initial, new FormData()),
        await deletePostAction(foreign.id, initial, new FormData()),
      ])
        expect(result).toMatchObject({ ok: false, formError: message });
      expect(
        (await other.client.GET("/posts/{id}", { params: { path: { id: foreign.id } } })).data!.data
          .attributes.status,
      ).toBe(status);
    }
    expect(await deletePostAction(randomUUID(), initial, new FormData())).toMatchObject({
      ok: false,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("폐기된 세션은 쿠키 정리와 로그인으로 보낸다", async () => {
    vi.mocked(readSession).mockResolvedValue({
      ...owner.session,
      accessToken: "revoked-post-session",
    });
    await expect(createPostAction(initial, fields("제목"))).rejects.toThrow(
      /redirect:\/session\/clear\?returnTo=/,
    );
    await expect(getMyPosts("en")).rejects.toThrow(/redirect:\/session\/clear\?returnTo=/);
  });
  it("현재 계약에서 도달할 수 없는 invalid_transition 응답도 번역 안내로 바꾼다", async () => {
    // 현 계약에서는 백엔드가 이 오류를 내지 않아 HTTP 응답 주입으로 확인한다.
    const actual = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (input instanceof Request && input.method === "PATCH")
        return new Response(
          JSON.stringify({
            errors: [
              {
                status: "422",
                code: "post.invalid_transition",
                source: { pointer: "/data/attributes/status" },
              },
            ],
          }),
          { status: 422, headers: { "Content-Type": "application/vnd.api+json" } },
        );
      return actual(input, init);
    });
    try {
      expect(await publishPostAction(randomUUID(), initial, new FormData())).toMatchObject({
        ok: false,
        formError: expect.any(String),
        invalidTransition: true,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("서버·연결 오류는 폼 검증으로 숨기지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      await expect(createPostAction(initial, fields("제목"))).rejects.toBeInstanceOf(ApiError);
    } finally {
      vi.restoreAllMocks();
    }
  });
  it("HTTP 500은 폼 오류로 바꾸지 않고 다시 던지며 페이지를 갱신하지 않는다", async () => {
    // 정상 목은 500을 만들지 않아 계약 응답만 HTTP 경계에서 주입한다.
    const actual = globalThis.fetch;
    const traceId = "123456789abcdef0123456789abcdef0";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (
        input instanceof Request &&
        input.method === "POST" && // gen:feature: 그대로
        new URL(input.url).pathname === "/api/v1/posts" // gen:feature: 그대로
      )
        return new Response(
          JSON.stringify({
            errors: [{ status: "500", code: "internal.unexpected" }],
            meta: { traceId },
          }),
          { status: 500, headers: { "Content-Type": "application/vnd.api+json" } },
        );
      return actual(input, init);
    });
    try {
      await expect(createPostAction(initial, fields("서버 오류"))).rejects.toMatchObject({
        name: "ApiError",
        status: 500,
        code: "internal.unexpected",
        traceId,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
