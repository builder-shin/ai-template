import "server-only";
import type { createApiClient } from "../api/client";
import type { ResourceDocument, WriteValues } from "./contract";
import type { AnyResource } from "./definition";
import { buildResourceDocument } from "./document";
import { resourceQuery, type ResourceSearchParams } from "./query";

type ResourceRequest = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  options: { params?: { path?: { id: string }; query?: object }; body?: unknown },
) => Promise<{ data?: unknown }>;

/** 세션을 공유하지 않는다. 호출하는 Server Component/Action의 클라이언트를 넘긴다. */
export function createResourceData(client: ReturnType<typeof createApiClient>) {
  // 계산한 경로와 openapi-fetch의 경로 리터럴 연결은 이 경계에만 둔다.
  // 공개 인자·응답은 계약에서 추출하고 HTTP·JSON:API·에러는 공유 클라이언트가 맡는다.
  const request = client.request as unknown as ResourceRequest;
  async function read<D>(
    method: "get" | "post" | "patch",
    path: string,
    options: Parameters<ResourceRequest>[2],
  ): Promise<D> {
    const { data } = await request(method, path, options);
    if (!data) throw new Error(`리소스 응답 없음 (${path}) — API 응답 문서를 확인한다.`);
    return data as D;
  }
  return {
    list<R extends AnyResource>(resource: R, searchParams: ResourceSearchParams = {}) {
      return read<ResourceDocument<R["type"], "list">>("get", `/${resource.type}`, {
        params: { query: resourceQuery(resource, searchParams) },
      });
    },
    detail<R extends AnyResource>(resource: R, id: string) {
      if (!resource.detail)
        throw new Error(`상세 화면 선언 없음 (${resource.type}) — 상세 필드를 선언한다.`);
      return read<ResourceDocument<R["type"], "detail">>("get", `/${resource.type}/{id}`, {
        params: {
          path: { id },
          ...(resource.list.include?.length
            ? { query: { include: resource.list.include.join(",") } }
            : {}),
        },
      });
    },
    create<R extends AnyResource>(resource: R, values: WriteValues<NoInfer<R["type"]>, "create">) {
      return read<ResourceDocument<R["type"], "create">>("post", `/${resource.type}`, {
        body: buildResourceDocument(resource, "create", values),
      });
    },
    update<R extends AnyResource>(
      resource: R,
      id: string,
      values: WriteValues<NoInfer<R["type"]>, "edit">,
    ) {
      return read<ResourceDocument<R["type"], "edit">>("patch", `/${resource.type}/{id}`, {
        params: { path: { id } },
        body: buildResourceDocument(resource, "edit", values, id),
      });
    },
    async delete<R extends AnyResource>(resource: R, id: string) {
      if (!resource.delete)
        throw new Error(`삭제 선언 없음 (${resource.type}) — 삭제 권한을 선언한다.`);
      await request("delete", `/${resource.type}/{id}`, { params: { path: { id } } });
    },
  };
}
