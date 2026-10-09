import { randomUUID } from "node:crypto";
import { admin, expect, login, test } from "./fixtures";

test("감사 로그의 행위·서울 날짜 필터와 상세는 역할 생성 메타데이터를 표시한다", async ({
  request,
  page,
}) => {
  const account = await admin(request, "ko", ["admin:access", "audit-logs:read"]);
  const name = `감사역할-${randomUUID()}`;
  const { data } = await account.seed.client.POST("/roles", {
    body: { data: { type: "roles", attributes: { name, permissions: [] } } },
  });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await login(page, account.account);
  await expect(page).toHaveURL("/audit-logs");
  await expect(page.getByRole("combobox", { name: "행위자", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "행위", exact: true }).click();
  await page.getByRole("option", { name: "역할 생성", exact: true }).click();
  await page.getByLabel("시작 날짜", { exact: true }).fill(today);
  await page.getByLabel("종료 날짜", { exact: true }).fill(today);
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page).toHaveURL(/filter%5Baction%5D=role.created/);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: data!.data.id, exact: true }) });
  await expect(row).toBeVisible();
  await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue(today);
  await expect(page.getByLabel("종료 날짜", { exact: true })).toHaveValue(today);
  await row.getByRole("link").click();
  await expect(page).toHaveURL(/\/audit-logs\/[\da-f-]+$/);
  await expect(page.getByText("역할 생성", { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText("name", { exact: true })).toBeVisible();
  await expect(page.getByText(data!.data.id, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: data!.data.id, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "수정", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);
});
