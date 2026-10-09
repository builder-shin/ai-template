import "server-only";
import type { createApiClient } from "../../lib/api/client";

/** 선택지는 API의 모든 페이지에서 읽고 이름은 리소스 번역을 쓴다. */
export async function permissionValues(client: ReturnType<typeof createApiClient>) {
  const values: string[] = [];
  for (let page = 1; ; page++) {
    const { data } = await client.GET("/permissions", {
      params: { query: { "page[number]": page, "page[size]": 20 } },
    });
    if (!data) throw new Error("권한 응답 없음 — API 응답 문서를 확인한다.");
    values.push(...data.data.map((permission) => permission.id));
    if (page >= data.meta.page.totalPages) return values;
  }
}
