import { randomUUID } from "node:crypto";
import {
  registerTestAccount,
  loginSeedAccount,
  loginTestAccount,
} from "../../src/lib/testing/account";
import { createApiClient } from "../../src/lib/api/client";
import type { components } from "../../src/lib/api/schema";

type PermissionCode = components["schemas"]["PermissionCode"];
type SeedAccount = { email: string; password: string };
export interface AccountOptions {
  mailLink?: (email: string, purpose: "verification") => Promise<string>;
  seedAccount?: SeedAccount;
}

export async function memberFixture(
  origin: string,
  locale: "ko" | "en" = "ko",
  options: AccountOptions = {},
) {
  const account = {
    email: `admin-test-${randomUUID()}@example.com`,
    name: "관리 테스트",
    locale,
    password: "admin-test-password", // betterleaks:allow 사유: E2E·목 통합 테스트 계정
  };
  let owner;
  if (options.mailLink) {
    const anonymous = createApiClient({ baseUrl: `${origin}/api/v1`, locale, log: () => {} });
    await anonymous.POST("/registrations", {
      body: { data: { type: "registrations", attributes: account } },
    });
    const link = await options.mailLink(account.email, "verification");
    const token = new URL(link).searchParams.get("token");
    if (!token) throw new Error("테스트 인증 메일에 토큰이 없다.");
    await anonymous.POST("/email-verifications", {
      body: { data: { type: "email-verifications", attributes: { token } } },
    });
    owner = await loginTestAccount({ origin, locale, account });
  } else owner = await registerTestAccount({ origin, locale, account });
  const me = (await owner.client.GET("/me")).data!;
  return { account, owner, userId: me.data.id };
}

export async function seedFixture(
  origin: string,
  account: SeedAccount = {
    email: "admin@example.com",
    password: "admin-password", // betterleaks:allow 사유: 목 시드 관리자
  },
) {
  return loginSeedAccount({
    origin,
    locale: "ko",
    account,
  });
}

export async function partialAdminFixture(
  origin: string,
  locale: "ko" | "en" = "ko",
  permissions: readonly PermissionCode[] = ["admin:access"],
  options: AccountOptions = {},
) {
  const member = await memberFixture(origin, locale, options);
  const seed = await seedFixture(origin, options.seedAccount);
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
