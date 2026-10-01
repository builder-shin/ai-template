import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { registerTestAccount, loginTestAccount } from "../../lib/testing/account";

/** 본인 정보와 여러 세션을 실제 목에서 검증한다. */
export async function profileFixture(locale: "ko" | "en" = "ko") {
  const origin = inject("mockBaseUrl");
  const email = `profile-${randomUUID()}@example.com`;
  const password = "profile-test-password"; // betterleaks:allow 사유: 테스트 비밀번호
  const account = { name: "기존 이름", email, password };
  const owner = await registerTestAccount({ origin, locale, account });
  const login = (secret = password) =>
    loginTestAccount({ origin, locale, account: { email, password: secret } });
  return {
    ...owner,
    password,
    login,
    async image(ready = true) {
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
        "base64",
      );
      const { data } = await owner.client.POST("/files", {
        body: {
          data: {
            type: "files",
            attributes: { filename: "avatar.png", contentType: "image/png", size: bytes.length },
          },
        },
      });
      const id = data!.data.id;
      if (ready) {
        const upload = data!.data.meta!.upload!;
        const put = await fetch(upload.url, {
          method: upload.method,
          headers: upload.headers as Record<string, string>,
          body: bytes,
        });
        if (!put.ok) throw new Error("아바타 업로드 실패");
        await owner.client.PATCH("/files/{id}", {
          params: { path: { id } },
          body: { data: { type: "files", id, attributes: { status: "ready" } } },
        });
      }
      return id;
    },
    async stop() {
      await owner.client.DELETE("/me");
    },
  };
}
