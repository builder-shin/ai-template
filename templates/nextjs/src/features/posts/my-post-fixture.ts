import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { registerTestAccount } from "../../lib/testing/account";

/** 권한이 없는 일반 계정으로 내 글을 검증한다. */
export async function myPostFixture(locale: "ko" | "en" = "ko", origin = inject("mockBaseUrl")) {
  const prefix = `my-posts-${randomUUID()}`;
  const email = `${prefix}@example.com`;
  const password = "my-posts-test-password"; // betterleaks:allow 테스트 비밀번호
  const { session, client } = await registerTestAccount({
    origin,
    locale,
    account: { name: prefix, email, password },
  });
  const me = (await client.GET("/me")).data!;
  return {
    prefix,
    session,
    client,
    userId: me.data.id,
    async create(status: "draft" | "published" = "draft") {
      return (
        await client.POST("/posts", {
          body: {
            data: { type: "posts", attributes: { title: prefix, body: "**본문**", status } },
          },
        })
      ).data!.data;
    },
    async stop() {
      await client.DELETE("/me");
    },
  };
}
