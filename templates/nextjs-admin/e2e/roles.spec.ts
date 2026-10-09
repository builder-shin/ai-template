import { randomUUID } from "node:crypto";
import { admin, expect, login, test } from "./fixtures";

const codes = ["admin:access", "roles:read", "roles:manage", "posts:create"] as const;
async function role(account: Awaited<ReturnType<typeof admin>>, name: string) {
  const { data } = await account.seed.client.POST("/roles", {
    body: { data: { type: "roles", attributes: { name, permissions: ["posts:create"] } } },
  });
  return data!.data;
}
test("역할 생성의 권한 선택기와 수정은 상세에 저장한 값을 표시한다", async ({ page }) => {
  const account = await admin("ko", codes);
  const name = `생성역할-${randomUUID()}`;
  await login(page, account.account);
  await expect(page).toHaveURL("/roles");
  await page.getByRole("link", { name: "생성", exact: true }).click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "설명", exact: true }).fill("첫 설명\n다음 줄");
  await page
    .getByRole("group", { name: "posts", exact: true })
    .getByRole("checkbox", { name: "글 작성", exact: true })
    .check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page).toHaveURL(/\/roles\/[\da-f-]+$/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await expect(page.getByText("글 작성", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "수정", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "글 작성", exact: true })).toBeChecked();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill(`${name}-수정`);
  await page.getByRole("textbox", { name: "설명", exact: true }).fill("수정 설명");
  await page.getByRole("checkbox", { name: "글 작성", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "역할과 권한 조회", exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page).toHaveURL(`/roles/${id}`);
  await expect(page.getByText("역할과 권한 조회", { exact: true })).toBeVisible();
  await expect(page.getByText("글 작성", { exact: true })).toHaveCount(0);
  const { data } = await account.owner.client.GET("/roles/{id}", { params: { path: { id } } });
  expect(data!.data.attributes).toMatchObject({
    name: `${name}-수정`,
    description: "수정 설명",
    permissions: ["roles:read"],
  });
});
test("사용자 역할 삭제는 dialog를 거치고 시스템 역할은 삭제 없이 이름 변경을 거절한다", async ({
  page,
}) => {
  const account = await admin("ko", codes);
  const record = await role(account, `삭제역할-${randomUUID()}`);
  await login(page, account.account);
  await expect(page).toHaveURL("/roles");
  await page.goto(`/roles/${record.id}`);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "삭제", exact: true })
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "삭제", exact: true })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(page).toHaveURL("/roles");
  await expect(
    account.owner.client.GET("/roles/{id}", { params: { path: { id: record.id } } }),
  ).rejects.toMatchObject({ status: 404 });
  const { data } = await account.owner.client.GET("/roles", {
    params: { query: { "filter[q]": "member" } },
  });
  const system = data!.data.find((item) => item.attributes.name === "member")!;
  await page.goto("/roles?filter%5Bq%5D=member");
  const row = page.getByRole("row", { name: /member/ });
  await expect(row.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);
  await page.goto(`/roles/${system.id}`);
  await expect(page.getByRole("button", { name: "삭제", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "수정", exact: true }).click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("바꿀 시스템 이름");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "시스템 역할은 변경할 수 없습니다.",
  );
  await expect(page).toHaveURL(`/roles/${system.id}/edit`);
});
test("권한 목록은 모든 코드·그룹·설명을 보이며 쓰기와 상세 링크가 없다", async ({ page }) => {
  const account = await admin("en", ["admin:access", "roles:read"]);
  await login(page, account.account);
  await expect(page).toHaveURL("/en/roles");
  await page
    .getByRole("navigation", { name: "Admin menu" })
    .getByRole("link", { name: "Permissions", exact: true })
    .click();
  await expect(page).toHaveURL("/en/permissions");
  const all = [
    "admin:access",
    "audit-logs:read",
    "posts:create",
    "posts:manage",
    "roles:manage",
    "roles:read",
    "users:manage",
    "users:read",
  ];
  await expect(page.getByRole("row")).toHaveCount(9);
  for (const code of all)
    await expect(page.getByRole("cell", { name: code, exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Sign in to the admin app.", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
});
test("역할 폼의 중복 이름 오류는 이름·설명·권한 선택을 유지한다", async ({ page }) => {
  const account = await admin("ko", codes);
  const name = `중복역할-${randomUUID()}`;
  await role(account, name);
  await login(page, account.account);
  await expect(page).toHaveURL("/roles");
  await page.goto("/roles/new");
  await page.getByRole("textbox", { name: "이름", exact: true }).fill(name);
  await page.getByRole("textbox", { name: "설명", exact: true }).fill("입력을 유지할 설명");
  await page.getByRole("checkbox", { name: "글 작성", exact: true }).check();
  await page.getByRole("checkbox", { name: "역할과 권한 조회", exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("이미 사용 중인 값입니다.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL("/roles/new");
  await expect(page.getByRole("textbox", { name: "이름", exact: true })).toHaveValue(name);
  await expect(page.getByRole("textbox", { name: "이름", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "설명", exact: true })).toHaveValue(
    "입력을 유지할 설명",
  );
  await expect(page.getByRole("checkbox", { name: "글 작성", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "역할과 권한 조회", exact: true })).toBeChecked();
});
