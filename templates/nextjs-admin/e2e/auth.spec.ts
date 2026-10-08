import { admin, member, expect, login, realtime, sessionCookieName, test } from "./fixtures";

test("로그인 뒤 관리 홈과 계정 정보·좁은 화면 메뉴를 보여 준다", async ({ page }) => {
  const { account } = await admin();
  await login(page, account);
  await expect(page).toHaveURL("/");
  await expect(page.getByText("등록된 관리 메뉴가 없습니다.")).toBeVisible();
  await expect(page.getByRole("banner").getByText(account.email)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("dialog", { name: "관리 메뉴" })).toBeVisible();
  await page.getByRole("button", { name: "메뉴 닫기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("일반 회원은 같은 로그인 화면에서 거절되며 새 세션·쿠키가 남지 않는다", async ({
  page,
  context,
}) => {
  const { account, owner } = await member();
  const before = (await owner.client.GET("/sessions")).data!.data.length;
  await login(page, account);
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "관리 화면에 접근할 권한이 없습니다.",
  );
  expect(
    (await context.cookies()).some(
      (cookie) => cookie.name === sessionCookieName || cookie.name === "admin-session",
    ),
  ).toBe(false);
  expect((await owner.client.GET("/sessions")).data!.data).toHaveLength(before);
});

test("로그아웃은 세션·쿠키를 끝내고 로그인 화면으로 돌아간다", async ({ page, context }) => {
  const { account, owner } = await admin();
  await login(page, account);
  await expect(page).toHaveURL("/");
  expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(true);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL("/login");
  expect((await context.cookies()).some((cookie) => cookie.name === sessionCookieName)).toBe(false);
  expect((await owner.client.GET("/sessions")).data!.data).toHaveLength(1);
});

test("로그인 중 관리 권한을 잃으면 실시간 이벤트 뒤 forbidden으로 간다", async ({ page }) => {
  const { account, roleId, seed } = await admin();
  const socket = realtime(page);
  await login(page, account);
  await expect(page).toHaveURL("/");
  await expect.poll(() => socket.connected).toBe(true);
  await seed.client.PATCH("/roles/{id}", {
    params: { path: { id: roleId } },
    body: { data: { type: "roles", id: roleId, attributes: { permissions: [] } } },
  });
  await expect.poll(() => socket.received("me.updated")).toBe(true);
  await expect(page).toHaveURL("/forbidden");
  await expect(page.getByRole("heading", { name: "접근 권한이 없습니다" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL("/login");
});

test("언어 전환은 URL·쿠키·계정 언어를 맞추고 다음 로그인에도 유지한다", async ({
  page,
  context,
}) => {
  const { account, owner } = await admin();
  await login(page, account);
  await expect(page).toHaveURL("/");
  await page
    .getByRole("navigation", { name: "언어 선택" })
    .getByRole("button", { name: "English" })
    .click();
  await expect(page).toHaveURL("/en");
  await expect(page.getByText("No admin resources are registered.")).toBeVisible();
  expect((await owner.client.GET("/me")).data!.data.attributes.locale).toBe("en");
  expect((await context.cookies()).find((cookie) => cookie.name === "NEXT_LOCALE")?.value).toBe(
    "en",
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("/en/login");
  await page.getByRole("link", { name: "한국어", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await login(page, { ...account, locale: "ko" });
  await expect(page).toHaveURL("/en");
});
