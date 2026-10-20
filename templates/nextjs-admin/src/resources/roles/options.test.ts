import { expect, it, vi } from "vitest";
import type { createApiClient } from "../../lib/api/client";
import { permissionValues } from "./options";
type QueryOptions = { params: { query: Record<string, number> } };

it("권한 선택값은 크기 20으로 모든 페이지를 순서대로 합치고 마지막에 멈춘다", async () => {
  const get = vi.fn(async (_path: string, { params: { query } }: QueryOptions) => {
    const page = query["page[number]"] as number;
    return {
      data: {
        data: [{ id: `p${page}-a` }, { id: `p${page}-b` }],
        meta: { page: { totalPages: 3 } },
      },
    };
  });
  const result = await permissionValues({ GET: get } as unknown as ReturnType<
    typeof createApiClient
  >);
  expect(result).toEqual(["p1-a", "p1-b", "p2-a", "p2-b", "p3-a", "p3-b"]);
  expect(get.mock.calls).toEqual(
    [1, 2, 3].map((page) => [
      "/permissions",
      { params: { query: { "page[number]": page, "page[size]": 20 } } },
    ]),
  );
});

it("다음 페이지의 응답 문서가 없으면 부분 권한 목록을 돌려주지 않는다", async () => {
  const get = vi.fn(async (_path: string, { params: { query } }: QueryOptions) =>
    query["page[number]"] === 1
      ? { data: { data: [{ id: "first" }], meta: { page: { totalPages: 2 } } } }
      : {},
  );
  await expect(
    permissionValues({ GET: get } as unknown as ReturnType<typeof createApiClient>),
  ).rejects.toThrow("권한 응답 없음");
  expect(get).toHaveBeenCalledTimes(2);
});
