import { randomUUID } from "node:crypto";
import { admin, member, expect, login, test } from "./fixtures";

const permissions = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:read",
  "posts:create",
] as const;
async function role(seed: Awaited<ReturnType<typeof admin>>["seed"], name: string) {
  const { data } = await seed.client.POST("/roles", {
    body: { data: { type: "roles", attributes: { name, permissions: ["posts:create"] } } },
  });
  return data!.data;
}
test("사용자 목록의 검색·상태·역할 필터는 대상 검색과 URL을 따른다", async ({ page }) => {
  const actor = await admin("ko", permissions);
  const first = await member();
  const second = await member();
  const prefix = `사용자목록-${randomUUID()}`;
  for (const [index, account] of [first, second].entries())
    await account.owner.client.PATCH("/me", {
      body: {
        data: { type: "users", id: account.userId, attributes: { name: `${prefix}-${index}` } },
      },
    });
  const name = `검색역할-${randomUUID()}`;
  const chosen = await role(actor.seed, name);
  await actor.seed.client.PATCH("/users/{id}", {
    params: { path: { id: first.userId } },
    body: {
      data: {
        type: "users",
        id: first.userId,
        attributes: { status: "deactivated" },
        relationships: { roles: { data: [{ type: "roles", id: chosen.id }] } },
      },
    },
  });
  await login(page, actor.account);
  await expect(page).toHaveURL("/users");
  await page.getByRole("searchbox", { name: "검색", exact: true }).fill(prefix);
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(3);
  await page.getByRole("combobox", { name: "상태", exact: true }).click();
  await page.getByRole("option", { name: "비활성", exact: true }).click();
  await page.getByRole("combobox", { name: "역할", exact: true }).click();
  await page.getByRole("textbox", { name: "대상 검색", exact: true }).fill(name);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("row").nth(1)).toContainText(first.account.email);
  const query = new URL(page.url()).searchParams;
  expect(query.get("filter[q]")).toBe(prefix);
  expect(query.get("filter[status]")).toBe("deactivated");
  expect(query.get("filter[role]")).toBe(chosen.id);
  expect(query.get("sort")).toBe("-createdAt");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "역할", exact: true })).toContainText(name);
});
test("사용자 수정 폼으로 역할을 부여하고 비활성화하면 상세에 두 값이 보인다", async ({ page }) => {
  const actor = await admin("ko", permissions);
  const target = await member();
  const name = `부여역할-${randomUUID()}`;
  const chosen = await role(actor.seed, name);
  await login(page, actor.account);
  await expect(page).toHaveURL("/users");
  await page.goto(`/users/${target.userId}/edit`);
  await page.getByRole("combobox", { name: "상태", exact: true }).click();
  await expect(page.getByRole("option", { name: "탈퇴", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "비활성", exact: true }).click();
  await page.getByRole("combobox", { name: "역할", exact: true }).click();
  await page.getByRole("textbox", { name: "대상 검색", exact: true }).fill(name);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page).toHaveURL(`/users/${target.userId}`);
  await expect(page.getByText("비활성", { exact: true })).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  const { data } = await actor.seed.client.GET("/users/{id}", {
    params: { path: { id: target.userId } },
  });
  expect(data!.data.attributes.status).toBe("deactivated");
  expect(data!.data.relationships?.roles?.data).toContainEqual({ type: "roles", id: chosen.id });
});
