import { randomUUID } from "node:crypto";
import { admin, member, expect, login, realtime, test } from "./fixtures";

async function post(
  owner: Awaited<ReturnType<typeof member>>["owner"],
  title: string,
  status: "draft" | "published" = "draft",
) {
  const result = await owner.client.POST("/posts", {
    body: { data: { type: "posts", attributes: { title, body: "골든 본문\n두 번째 줄", status } } },
  });
  expect(result.response.status).toBe(201);
  return result.data!.data;
}
test("글 목록의 검색·상태·작성자 필터, 양방향 정렬과 페이지를 URL에 보존한다", async ({ page }) => {
  const { account } = await admin();
  const author = await member();
  const prefix = `목록-${randomUUID()}`;
  await author.owner.client.PATCH("/me", {
    body: { data: { type: "users", id: author.userId, attributes: { name: prefix } } },
  });
  for (let index = 1; index <= 22; index++)
    await post(author.owner, `${prefix}-${String(index).padStart(2, "0")}`, "published");
  await post(author.owner, `${prefix}-초안`);
  await login(page, account);
  await expect(page).toHaveURL("/posts");
  await page.getByRole("searchbox", { name: "검색", exact: true }).fill(prefix);
  await page.getByRole("combobox", { name: "상태", exact: true }).click();
  await page.getByRole("option", { name: "발행됨", exact: true }).click();
  await page.getByRole("combobox", { name: "작성자", exact: true }).click();
  await page.getByRole("option", { name: prefix, exact: true }).click();
  await page.getByRole("combobox", { name: "정렬", exact: true }).click();
  await page.getByRole("option", { name: "제목 오름차순", exact: true }).click();
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText(`${prefix}-01`);
  await expect(page.getByRole("row")).toHaveCount(21);
  await expect(page.getByText("1 / 2 페이지 · 22개")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("filter[author]")).toBe(author.userId);
  await page.getByRole("link", { name: "다음", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText(`${prefix}-21`);
  await expect(page.getByRole("row")).toHaveCount(3);
  expect(new URL(page.url()).searchParams.get("filter[q]")).toBe(prefix);
  expect(new URL(page.url()).searchParams.get("filter[status]")).toBe("published");
  expect(new URL(page.url()).searchParams.get("sort")).toBe("title");
  await page.getByRole("combobox", { name: "정렬", exact: true }).click();
  await page.getByRole("option", { name: "제목 내림차순", exact: true }).click();
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText(`${prefix}-22`);
  expect(new URL(page.url()).searchParams.get("page[number]")).toBe("1");
});
test("글 상세의 발행과 발행 취소는 상태와 버튼을 바꾼다", async ({ page }) => {
  const { account, seed } = await admin();
  const author = await member();
  const record = await post(author.owner, `상태-${randomUUID()}`);
  await login(page, account);
  await expect(page).toHaveURL("/posts");
  await page.goto(`/posts/${record.id}`);
  await expect(page.getByText("골든 본문\n두 번째 줄")).toBeVisible();
  await expect(page.getByRole("button", { name: "발행 취소", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "발행", exact: true }).click();
  await expect(page.getByText("발행됨", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "발행", exact: true })).toHaveCount(0);
  expect(
    (await seed.client.GET("/posts/{id}", { params: { path: { id: record.id } } })).data!.data
      .attributes.status,
  ).toBe("published");
  await page.getByRole("button", { name: "발행 취소", exact: true }).click();
  await expect(page.getByText("초안", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "발행", exact: true })).toBeVisible();
});
test("글 삭제는 확인 대화상자의 취소와 삭제 뒤 목록 이동을 따른다", async ({ page }) => {
  const { account, seed } = await admin();
  const author = await member();
  const record = await post(author.owner, `삭제-${randomUUID()}`);
  await login(page, account);
  await expect(page).toHaveURL("/posts");
  await page.goto(`/posts/${record.id}`);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "삭제", exact: true })
    .getByRole("button", { name: "취소" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await seed.client.GET("/posts/{id}", { params: { path: { id: record.id } } })).response.status,
  ).toBe(200);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "삭제", exact: true })
    .getByRole("button", { name: "확인" })
    .click();
  await expect(page).toHaveURL("/posts");
  await expect(
    seed.client.GET("/posts/{id}", { params: { path: { id: record.id } } }),
  ).rejects.toMatchObject({ status: 404, code: "resource.not_found" });
});
test("다른 세션의 초안 생성은 posts:all 이벤트 뒤 목록에 나타난다", async ({ page }) => {
  const { account } = await admin();
  const author = await member();
  const title = `실시간-${randomUUID()}`;
  const socket = realtime(page);
  await login(page, account);
  await expect(page).toHaveURL("/posts");
  await page.goto(`/posts?${new URLSearchParams({ "filter[q]": title })}`);
  await expect(page.getByText("결과가 없습니다.")).toBeVisible();
  await expect.poll(() => socket.subscribed("posts:all")).toBe(true);
  const record = await post(author.owner, title);
  await expect.poll(() => socket.received("post.created")).toBe(true);
  await expect(page.getByRole("row", { name: new RegExp(title) })).toBeVisible();
  const subscribed = socket.subscriptionCount("posts:all");
  await page.getByRole("row", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(`/posts/${record.id}`);
  await expect.poll(() => socket.subscriptionCount("posts:all")).toBeGreaterThan(subscribed);
  const changed = `${title}-변경`;
  await author.owner.client.PATCH("/posts/{id}", {
    params: { path: { id: record.id } },
    body: { data: { type: "posts", id: record.id, attributes: { title: changed } } },
  });
  await expect.poll(() => socket.received("post.updated")).toBe(true);
  await expect(page.getByText(changed, { exact: true })).toBeVisible();
});
test("일부 권한 관리자의 메뉴와 화면은 리소스 권한을 따른다", async ({ page }) => {
  const partial = await admin("ko", ["admin:access"]);
  await login(page, partial.account);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("등록된 관리 메뉴가 없습니다.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "관리 메뉴" }).getByRole("link")).toHaveCount(
    0,
  );
  await page.goto("/posts");
  await expect(page).toHaveURL("/forbidden");
  await page.getByRole("main").getByRole("button", { name: "로그아웃", exact: true }).click();
  const postsOnly = await admin("ko", ["admin:access", "posts:manage"]);
  await login(page, postsOnly.account);
  await expect(page).toHaveURL("/posts");
  await expect(
    page
      .getByRole("navigation", { name: "관리 메뉴" })
      .getByRole("link", { name: "글", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "작성자", exact: true })).toBeDisabled();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "이 작업을 할 권한이 없습니다.",
  );
  await expect(page.getByRole("table")).toBeVisible();
});
test("등록하지 않은 리소스와 글 작성·수정 화면은 404다", async ({ page }) => {
  const { account } = await admin();
  await login(page, account);
  await expect(page).toHaveURL("/posts");
  for (const path of ["/users", "/posts/new", "/posts/01900000-0000-7000-8000-000000000000/edit"]) {
    const response = await page.goto(path);
    await expect(page.getByRole("heading", { name: "화면을 찾을 수 없습니다" })).toBeVisible();
    // 스트리밍이 시작된 not-found는 HTTP 200일 수 있다. 오류 화면과 색인 금지로 확인한다.
    expect([200, 404]).toContain(response!.status());
    await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
  }
});
