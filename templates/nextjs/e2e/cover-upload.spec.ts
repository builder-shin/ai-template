import { test, expect, signupAndVerify, login } from "./fixtures";

test("실제 브라우저 PUT·ready 확인 후 글 커버를 저장하고 해제한다", async ({ page, target }) => {
  const account = await signupAndVerify(page, target, "en");
  await login(page, account);
  await page.goto("/en/my-posts/new");
  await page.getByLabel("Title", { exact: true }).fill(account.name);
  await page.getByLabel("Body", { exact: true }).fill("**Cover upload**");
  // 바이너리는 저장하지 않고 실제 PNG를 실행 때 만든다.
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .getByLabel("Cover image", { exact: true })
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: image });
  await expect(page.locator('input[name="coverImage"]')).not.toHaveValue("");
  await expect(page.getByRole("img", { name: "Cover image", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/my-posts\/.+\/edit/);
  await expect(page.getByRole("img", { name: "Cover image", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "Cover image", exact: true })
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Clear image", exact: true }).click();
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.request().headers()["next-action"] !== undefined,
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await updateResponse;
  await expect(page.locator('input[name="coverImage"]')).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("img", { name: "Cover image", exact: true })).toHaveCount(0);
});
