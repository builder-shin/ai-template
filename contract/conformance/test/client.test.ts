import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/client.ts";
import { MEDIA_TYPE } from "../src/jsonapi/assertions.ts";
import { ContractViolation } from "../src/validation.ts";

function recordingFetch(body: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = (request: Request) => {
    requests.push(request);
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": MEDIA_TYPE } }),
    );
  };
  return { requests, fetch };
}

const emptyPage = {
  data: [],
  links: { first: "/p", last: "/p", prev: null, next: null },
  meta: { page: { number: 1, size: 5, total: 0, totalPages: 0 } },
};

const errorDocument = {
  errors: [{ status: "400", code: "jsonapi.invalid_document", title: "Bad Request" }],
  meta: { traceId: "0123456789abcdef0123456789abcdef" },
};

describe("createApiClient", () => {
  it("JSON:API 헤더, Bearer 토큰, 대괄호 쿼리를 보낸다", async () => {
    const { requests, fetch } = recordingFetch(emptyPage);
    const client = createApiClient({ baseUrl: "http://api.test", accessToken: "t0k", fetch });

    const { data } = await client.GET("/api/v1/posts", {
      params: { query: { "page[size]": 5, "filter[status]": "published" } },
    });

    const [request] = requests;
    expect(request?.headers.get("Accept")).toBe(MEDIA_TYPE);
    expect(request?.headers.get("Authorization")).toBe("Bearer t0k");
    const query = new URL(request?.url ?? "").searchParams;
    expect(query.get("page[size]")).toBe("5");
    expect(query.get("filter[status]")).toBe("published");
    expect(data?.meta.page.total).toBe(0);
  });

  it("본문이 있는 요청은 JSON:API Content-Type으로 보낸다", async () => {
    const { requests, fetch } = recordingFetch(errorDocument, 400);
    const client = createApiClient({ baseUrl: "http://api.test", fetch });

    await client.POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: "a@example.com", password: "secret-pw" }, // betterleaks:allow 테스트용 가짜 값
        },
      },
    });

    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("Content-Type")).toBe(MEDIA_TYPE);
    expect(request?.headers.get("Authorization")).toBeNull();
  });

  it("계약과 어긋난 응답이면 ContractViolation을 던진다", async () => {
    const { fetch } = recordingFetch({}, 201);
    const client = createApiClient({ baseUrl: "http://api.test", fetch });
    await expect(
      client.POST("/api/v1/posts", {
        body: { data: { type: "posts", attributes: { title: "t", body: "b" } } },
      }),
    ).rejects.toBeInstanceOf(ContractViolation);
  });
});
