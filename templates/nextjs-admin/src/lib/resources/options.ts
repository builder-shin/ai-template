import "server-only";
import type { createApiClient } from "../api/client";
import type { AnyResource } from "./definition";
import type { Option, ScreenRecord } from "../../components/resource/types";
import { presentation, filterPresentation } from "./values";
import { recordLabel } from "./labels";
import { ko } from "../i18n/catalogs";

export async function relationOptions(
  client: ReturnType<typeof createApiClient>,
  resource: AnyResource,
  name: string,
  query = "",
  unnamedUser = ko.layout.unnamedUser,
  screen: "list" | "create" | "edit" = "list",
): Promise<Option[]> {
  const relation = (screen === "list" ? filterPresentation : presentation)(resource, name).relation;
  if (!relation) return [];
  // 경로는 서버 선언에서만 고른다. 브라우저가 대상 API 경로를 지정하지 못한다.
  const request = client.request as unknown as (
    method: "get",
    path: string,
    options: { params: { query: Record<string, string | number> } },
  ) => Promise<{ data?: { data: ScreenRecord[]; meta: { page: { totalPages: number } } } }>;
  const records: ScreenRecord[] = [];
  let number = 1,
    totalPages = 1;
  do {
    const { data } = await request("get", `/${relation.type}`, {
      params: {
        query: {
          "page[number]": number,
          "page[size]": 20,
          ...(relation.search && query ? { "filter[q]": query } : {}),
        },
      },
    });
    if (!data) throw new Error("관계 목록 응답 없음 — API 응답 문서를 확인한다.");
    records.push(...data.data);
    totalPages = data.meta.page.totalPages;
    number++;
  } while (!relation.search && number <= totalPages);
  return records.map((record) => ({
    value: record.id,
    label: recordLabel(record, relation.label, record.id, unnamedUser),
  }));
}
