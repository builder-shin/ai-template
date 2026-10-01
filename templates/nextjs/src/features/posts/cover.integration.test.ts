import { afterAll, beforeAll, beforeEach, expect, inject, it, vi } from "vitest";
import { EXAMPLE_SESSION_SECRET } from "../../lib/env";
import { readSession } from "../../lib/session/request";
import { myPostFixture } from "./my-post-fixture";
import { createPostAction, updatePostAction, publishPostAction } from "./actions";
import { getMyPost, getMyPosts, getPost, getPosts } from "./queries";

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
beforeEach(() => vi.mocked(readSession).mockResolvedValue(owner.session));
afterAll(async () => {
  if (owner) {
    const posts = (
      await owner.client.GET("/posts", {
        params: { query: { "filter[author]": owner.userId } },
      })
    ).data!.data;
    for (const post of posts)
      await owner.client.DELETE("/posts/{id}", { params: { path: { id: post.id } } });
  }
  await owner?.stop();
  await other?.stop();
  vi.unstubAllEnvs();
});
async function image(actor = owner, ready = true) {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  const file = (
    await actor.client.POST("/files", {
      body: {
        data: {
          type: "files",
          attributes: { filename: "cover.png", contentType: "image/png", size: bytes.length },
        },
      },
    })
  ).data!.data;
  if (ready) {
    const upload = file.meta!.upload!;
    expect(
      (await fetch(upload.url, { method: upload.method, headers: upload.headers, body: bytes }))
        .status,
    ).toBe(200);
    await actor.client.PATCH("/files/{id}", {
      params: { path: { id: file.id } },
      body: { data: { type: "files", id: file.id, attributes: { status: "ready" } } },
    });
  }
  return file.id;
}
function fields(coverImage?: string) {
  const data = new FormData();
  data.set("title", owner.prefix);
  data.set("body", "커버 본문");
  if (coverImage !== undefined) data.set("coverImage", coverImage);
  return data;
}
it("작성 때 ready 커버를 설정하고 발행·수정 때 보존·교체·해제하며 공개 목록·상세에 반영한다", async () => {
  const first = await image();
  await expect(createPostAction({ ok: true }, fields(first))).rejects.toThrow(
    /redirect:\/en\/my-posts\/.+\/edit/,
  );
  const post = (await getMyPosts("en")).posts.find((item) => item.title === owner.prefix)!;
  expect(await getMyPost("en", post.id)).toMatchObject({
    coverImage: first,
    coverUrl: expect.stringContaining("/_storage/"),
  });
  await expect(publishPostAction(post.id, { ok: true }, new FormData())).rejects.toThrow(
    /redirect:/,
  );
  expect((await getPost("en", post.id))?.coverUrl).toContain("/_storage/");
  expect((await getPosts("en", owner.prefix)).posts[0]?.coverUrl).toContain("/_storage/");
  await expect(updatePostAction(post.id, { ok: true }, fields())).rejects.toThrow(/redirect:/);
  expect((await getMyPost("en", post.id))?.coverImage).toBe(first);
  const second = await image();
  await expect(updatePostAction(post.id, { ok: true }, fields(second))).rejects.toThrow(
    /redirect:/,
  );
  expect((await getMyPost("en", post.id))?.coverImage).toBe(second);
  await expect(updatePostAction(post.id, { ok: true }, fields(""))).rejects.toThrow(/redirect:/);
  expect(await getMyPost("en", post.id)).toMatchObject({ coverImage: null, coverUrl: null });
  expect((await getPost("en", post.id))?.coverUrl).toBeNull();
});
it("남의 파일·pending 파일은 커버로 거절하고 입력 값을 보존한다", async () => {
  for (const fileId of [await image(other), await image(owner, false)]) {
    expect(await createPostAction({ ok: true }, fields(fileId))).toMatchObject({
      ok: false,
      formError: expect.any(String),
      values: { coverImage: fileId },
    });
  }
});
