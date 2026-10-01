import { randomUUID } from "node:crypto";
import { test, expect, signupAndVerify, login } from "./fixtures";
import { webOrigin } from "./targets";
import { observeRealtime } from "./realtime";
import ko from "../messages/ko.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

for (const locale of ["ko", "en"] as const) {
  const t = locale === "ko" ? ko : en;
  const prefix = locale === "ko" ? "" : "/en";
  test(`${locale} 내 글 작성·커버·수정·발행·발행 취소·삭제가 공개 화면과 맞는다`, async ({
    page,
    target,
  }) => {
    const account = await signupAndVerify(page, target, locale);
    await login(page, account);
    await page
      .getByRole("banner")
      .getByRole("link", { name: t.layout.myPosts, exact: true })
      .click();
    await page.getByRole("link", { name: t.posts.newPost, exact: true }).click();
    const title = `Post ${randomUUID()}`;
    await page.getByLabel(t.posts.titleLabel, { exact: true }).fill(title);
    await page.getByLabel(t.posts.bodyLabel, { exact: true }).fill("**W3 markdown**");
    await page.getByRole("tab", { name: t.posts.preview, exact: true }).click();
    await expect(page.getByRole("tabpanel")).toHaveText("W3 markdown");
    await page.getByLabel(t.posts.coverLabel, { exact: true }).setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(page.locator('input[name="coverImage"]')).not.toHaveValue("");
    await page.getByRole("button", { name: t.posts.save, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${prefix}/my-posts/[^/]+/edit$`));
    const editPath = new URL(page.url()).pathname;
    const id = editPath.split("/").at(-2)!;
    const editedTitle = `${title} edited`;
    await page.getByLabel(t.posts.titleLabel, { exact: true }).fill(editedTitle);
    await page.getByRole("button", { name: t.posts.save, exact: true }).click();
    await page.getByRole("button", { name: t.posts.publish, exact: true }).click();
    await expect(page.getByRole("button", { name: t.posts.unpublish, exact: true })).toBeVisible();
    await page.getByRole("link", { name: t.posts.viewPublic, exact: true }).click();
    await expect(page).toHaveURL(`${prefix}/posts/${id}`);
    await expect(page.getByRole("heading", { name: editedTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toContainText("W3 markdown");
    await expect
      .poll(() =>
        page
          .getByRole("img", { name: t.posts.coverAlt.replace("{title}", editedTitle), exact: true })
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(1);
    await page.goto(`${prefix}/my-posts?status=published`);
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toBeVisible();
    await page.goto(`${prefix}/posts?q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toBeVisible();
    await page.goto(editPath);
    await page.getByRole("button", { name: t.posts.unpublish, exact: true }).click();
    await expect(page.getByRole("button", { name: t.posts.publish, exact: true })).toBeVisible();
    await page.goto(`${prefix}/posts?q=${encodeURIComponent(title)}`);
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toHaveCount(0);
    await page.goto(`${prefix}/my-posts?status=draft`);
    await page.getByRole("link", { name: editedTitle, exact: true }).click();
    await page.getByRole("link", { name: t.posts.deletePost, exact: true }).click();
    await expect(page.getByRole("main")).toContainText(
      t.posts.deleteConfirmation.replace("{title}", editedTitle),
    );
    await page.getByRole("button", { name: t.posts.deletePost, exact: true }).click();
    await expect(page).toHaveURL(`${prefix}/my-posts`);
    await expect(page.getByRole("link", { name: editedTitle, exact: true })).toHaveCount(0);
    await page.goto(editPath);
    await expect(page.getByRole("heading", { name: t.notFound.title, exact: true })).toBeVisible();
  });
}

test("다른 컨텍스트의 발행·취소가 공개 목록에 새로고침 없이 실시간 반영된다", async ({
  page,
  target,
  browser,
}) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  const title = `Live ${randomUUID()}`;
  await page.goto("/en/my-posts/new");
  await page.getByLabel(en.posts.titleLabel, { exact: true }).fill(title);
  await page.getByLabel(en.posts.bodyLabel, { exact: true }).fill("Live publication");
  await page.getByRole("button", { name: en.posts.save, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/my-posts\/[^/]+\/edit$/);
  const peer = await browser.newContext({ baseURL: webOrigin });
  try {
    const reader = await peer.newPage();
    const realtime = observeRealtime(reader);
    let documents = 0;
    reader.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === reader.mainFrame()) documents += 1;
    });
    const path = `/en/posts?q=${encodeURIComponent(title)}`;
    await reader.goto(path);
    await expect(reader.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    // 실제 posts 구독 ack 뒤에 발행하여 연결 시작과 변경의 경합을 없앤다.
    await expect.poll(() => realtime.postsSubscribed).toBe(true);
    await page.getByRole("button", { name: en.posts.publish, exact: true }).click();
    await expect(reader.getByRole("link", { name: title, exact: true })).toBeVisible();
    expect(realtime.received.has("post.published")).toBe(true);
    await page.getByRole("button", { name: en.posts.unpublish, exact: true }).click();
    await expect(reader.getByRole("link", { name: title, exact: true })).toHaveCount(0);
    expect(realtime.received.has("post.unpublished")).toBe(true);
    await expect(reader).toHaveURL(path);
    expect(documents).toBe(1);
  } finally {
    await peer.close();
  }
});
