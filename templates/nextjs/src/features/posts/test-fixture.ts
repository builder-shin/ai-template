import { randomUUID } from "node:crypto";
import { inject } from "vitest";
import { loginSeedAccount } from "../../lib/testing/account";

/** 실제 목 API로 만든 글은 테스트가 끝나면 지운다. */
export async function postFixture() {
  const { session, client } = await loginSeedAccount({
    origin: inject("mockBaseUrl"),
    locale: "ko",
    account: {
      email: "admin@example.com",
      password: "admin-password", // betterleaks:allow 사유: 테스트 시드
    },
  });
  const prefix = `posts-${randomUUID()}`;
  const ids: string[] = [];
  // 파일은 런타임에 만든다. 저장소에는 바이너리를 두지 않는다.
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  const file = (
    await client.POST("/files", {
      body: {
        data: {
          type: "files",
          attributes: { filename: "cover.png", contentType: "image/png", size: image.length },
        },
      },
    })
  ).data!;
  const upload = file.data.meta!.upload!;
  const put = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: image,
  });
  if (!put.ok) throw new Error("테스트 커버 업로드 실패");
  await client.PATCH("/files/{id}", {
    params: { path: { id: file.data.id } },
    body: { data: { type: "files", id: file.data.id, attributes: { status: "ready" } } },
  });
  async function create(title: string, status: "draft" | "published", cover = false) {
    const { data } = await client.POST("/posts", {
      body: {
        data: {
          type: "posts",
          attributes: {
            title: `${prefix} ${title}`,
            body: "## 본문\n\n**굵게**\n\n<script>alert(1)</script>",
            status,
          },
          ...(cover
            ? { relationships: { coverImage: { data: { type: "files", id: file.data.id } } } }
            : {}),
        },
      },
    });
    if (!data) throw new Error("테스트 글이 없다.");
    ids.push(data.data.id);
    return data.data;
  }
  const z = await create("Z", "published", true);
  const a = await create("A", "published");
  const m = await create("M", "published");
  // 생성일순과 발행일순이 다른 결과를 내도록 가장 오래된 글을 다시 발행한다.
  for (const status of ["draft", "published"] as const) {
    await client.PATCH("/posts/{id}", {
      params: { path: { id: z.id } },
      body: { data: { type: "posts", id: z.id, attributes: { status } } },
    });
  }
  const draft = await create("초안", "draft");
  return {
    prefix,
    z,
    a,
    m,
    draft,
    session,
    fileId: file.data.id,
    stop: async () => {
      for (const id of ids) await client.DELETE("/posts/{id}", { params: { path: { id } } });
    },
  };
}
