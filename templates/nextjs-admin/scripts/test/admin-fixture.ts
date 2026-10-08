import { randomUUID } from "node:crypto";
import { registerTestAccount, loginSeedAccount } from "../../src/lib/testing/account";
import type { components } from "../../src/lib/api/schema";

type PermissionCode = components["schemas"]["PermissionCode"];

export async function memberFixture(origin: string, locale: "ko" | "en" = "ko") {
  const account = {
    email: `admin-test-${randomUUID()}@example.com`,
    name: "관리 테스트",
    locale,
    password: "admin-test-password", // betterleaks:allow 사유: 목 전용 테스트 계정
  };
  const owner = await registerTestAccount({ origin, locale, account });
  const me = (await owner.client.GET("/me")).data!;
  return { account, owner, userId: me.data.id };
}

export async function seedFixture(origin: string) {
  return loginSeedAccount({
    origin,
    locale: "ko",
    account: {
      email: "admin@example.com",
      password: "admin-password", // betterleaks:allow 사유: 목 시드 관리자
    },
  });
}

export async function partialAdminFixture(
  origin: string,
  locale: "ko" | "en" = "ko",
  permissions: readonly PermissionCode[] = ["admin:access"],
) {
  const member = await memberFixture(origin, locale);
  const seed = await seedFixture(origin);
  const { data: role } = await seed.client.POST("/roles", {
    body: {
      data: {
        type: "roles",
        attributes: {
          name: `partial-${randomUUID()}`,
          permissions: [...permissions],
        },
      },
    },
  });
  const roleId = role!.data.id;
  await seed.client.PATCH("/users/{id}", {
    params: { path: { id: member.userId } },
    body: {
      data: {
        type: "users",
        id: member.userId,
        relationships: { roles: { data: [{ type: "roles", id: roleId }] } },
      },
    },
  });
  return { ...member, seed, roleId };
}
