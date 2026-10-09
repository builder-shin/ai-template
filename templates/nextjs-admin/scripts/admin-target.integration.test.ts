import { expect, inject, it } from "vitest";
import { memberFixture, partialAdminFixture, seedFixture } from "./test/admin-fixture";

it("대상의 메일 링크로 실제 API 가입·인증·로그인을 준비한다", async () => {
  const origin = inject("mockBaseUrl");
  const recipients: string[] = [];
  const member = await memberFixture(origin, "en", {
    async mailLink(email) {
      recipients.push(email);
      const response = await fetch(`${origin}/_test/mail?to=${encodeURIComponent(email)}`);
      const body = (await response.json()) as { messages: { text: string }[] };
      return body.messages[0]!.text.match(/https?:\/\/\S+/)![0]!;
    },
  });
  expect(recipients).toEqual([member.account.email]);
  const me = (await member.owner.client.GET("/me")).data!;
  expect(me.data.attributes).toMatchObject({ email: member.account.email, locale: "en" });
  expect(me.data.attributes.emailVerifiedAt).toBeTruthy();
});

it("대상의 잘못된 인증 링크는 가입 준비를 실패시킨다", async () => {
  await expect(
    memberFixture(inject("mockBaseUrl"), "ko", {
      mailLink: async () => "http://localhost:3101/verify-email",
    }),
  ).rejects.toThrow("토큰");
});

it("시드 계정 입력을 사용해 역할을 만들며 목 기본 계정으로 대체하지 않는다", async () => {
  const origin = inject("mockBaseUrl");
  const custom = await partialAdminFixture(origin, "ko", [
    "admin:access",
    "roles:manage",
    "users:manage",
    "posts:create",
  ]);
  const signedIn = await seedFixture(origin, custom.account);
  expect((await signedIn.client.GET("/me")).data!.data.id).toBe(custom.userId);
  const prepared = await partialAdminFixture(origin, "ko", ["admin:access"], {
    seedAccount: custom.account,
  });
  expect((await prepared.seed.client.GET("/me")).data!.data.id).toBe(custom.userId);
  expect((await prepared.owner.client.GET("/me")).data!.meta.permissions).toContain("admin:access");
});
