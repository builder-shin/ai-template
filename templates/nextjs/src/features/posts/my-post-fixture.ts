import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { createApiClient } from "../../lib/api/client";

/** 권한이 없는 일반 계정으로 내 글을 검증한다. */
export async function myPostFixture(locale: "ko" | "en" = "ko") {
  const baseUrl = `${inject("mockBaseUrl")}/api/v1`;
  const anonymous = createApiClient({ baseUrl, locale, log: () => {} });
  const prefix = `my-posts-${randomUUID()}`;
  const email = `${prefix}@example.com`;
  const password = "my-posts-test-password"; // betterleaks:allow 테스트 비밀번호
  await anonymous.POST("/registrations", {
    body: { data: { type: "registrations", attributes: { name: prefix, email, password } } },
  });
  const mail = await fetch(`${inject("mockBaseUrl")}/_test/mail?to=${email}`);
  const { messages } = (await mail.json()) as { messages: { text: string }[] };
  const token = new URL(messages[0]!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
  await anonymous.POST("/email-verifications", {
    body: { data: { type: "email-verifications", attributes: { token } } },
  });
  const { data } = await anonymous.POST("/sessions", {
    body: { data: { type: "sessions", attributes: { grantType: "password", email, password } } },
  });
  const session = data!.data.attributes;
  const client = createApiClient({
    baseUrl,
    locale,
    accessToken: session.accessToken,
    log: () => {},
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
