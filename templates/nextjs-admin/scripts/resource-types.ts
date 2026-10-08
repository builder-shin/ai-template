import { defineResource } from "../src/lib/resources/definition";
import { createResourceData } from "../src/lib/resources/data";
import type { createApiClient } from "../src/lib/api/client";
import { resources } from "../src/resources";

// 실행하지 않는다. types 단계의 tsc가 오류 주석과 실제 진단을 함께 검사한다.
export function resourceTypeChecks(client: ReturnType<typeof createApiClient>) {
  const data = createResourceData(client);
  for (const resource of resources) {
    data.list(resource, {});
  }
  defineResource({
    type: "posts",
    permission: "posts:manage",
    list: {
      columns: ["title", "author"],
      filters: { "filter[q]": "text", "filter[status]": "enum" },
      sort: { fields: ["title", "createdAt"], default: "-createdAt" },
      include: ["author"],
    },
    detail: { fields: ["title", "coverImage"] },
    create: { permission: "posts:create", fields: { title: "text", body: "textarea" } },
    edit: { permission: "posts:manage", fields: { status: "enum", coverImage: "relation" } },
    delete: { permission: "posts:manage" },
  });
  defineResource({
    type: "posts",
    permission: "posts:manage",
    // @ts-expect-error 사유: 계약에 없는 열은 컴파일 오류여야 한다.
    list: { columns: ["wrongField"] },
  });
  defineResource({
    type: "posts",
    permission: "posts:manage",
    // @ts-expect-error 사유: 상세도 계약에 없는 필드를 거절해야 한다.
    detail: { fields: ["wrongField"] },
    list: { columns: ["title"] },
  });
  defineResource({
    type: "posts",
    permission: "posts:manage",
    // @ts-expect-error 사유: 목록 계약에 없는 필터는 컴파일 오류여야 한다.
    list: { columns: ["title"], filters: { "filter[wrong]": "text" } },
  });
  defineResource({
    type: "posts",
    permission: "posts:manage",
    // @ts-expect-error 사유: 속성에 없는 정렬 키는 컴파일 오류여야 한다.
    list: { columns: ["title"], sort: { fields: ["wrongSort"] } },
  });
  defineResource({
    type: "posts",
    permission: "posts:manage",
    list: { columns: ["title"] },
    // @ts-expect-error 사유: 작성자는 쓰기 계약의 필드가 아니다.
    edit: { permission: "posts:manage", fields: { author: "relation" } },
  });
  defineResource({
    type: "audit-logs",
    permission: "audit-logs:read",
    list: { columns: ["action"] },
    // @ts-expect-error 사유: 감사 로그에는 생성 operation이 없다.
    create: { permission: "audit-logs:read", fields: {} },
  });
  defineResource({
    type: "audit-logs",
    permission: "audit-logs:read",
    list: { columns: ["action"] },
    // @ts-expect-error 사유: 감사 로그에는 수정 operation이 없다.
    edit: { permission: "audit-logs:read", fields: {} },
  });
  defineResource({
    type: "audit-logs",
    permission: "audit-logs:read",
    list: { columns: ["action"] },
    // @ts-expect-error 사유: 감사 로그에는 삭제 operation이 없다.
    delete: { permission: "audit-logs:read" },
  });
  defineResource({
    type: "permissions",
    permission: "roles:read",
    list: {
      columns: ["group"],
      // @ts-expect-error 사유: 필터 파라미터 없는 목록은 필터 선언을 거절해야 한다.
      filters: { "filter[bogus]": "text" },
    },
  });
  defineResource({
    type: "permissions",
    permission: "roles:read",
    list: { columns: ["group"] },
    // @ts-expect-error 사유: 권한에는 단건 operation이 없다.
    detail: { fields: ["group"] },
  });
  const audits = defineResource({
    type: "audit-logs",
    permission: "audit-logs:read",
    list: { columns: ["action"] },
  });
  // @ts-expect-error 사유: 없는 생성 operation은 데이터 호출에서도 거절한다.
  data.create(audits, {});
  const posts = defineResource({
    type: "posts",
    permission: "posts:manage",
    list: { columns: ["title"] },
    edit: { permission: "posts:manage", fields: { status: "enum" } },
  });
  // @ts-expect-error 사유: 요청 값도 계약의 열거값에 맞아야 한다.
  data.update(posts, "id", { status: "invalid" });
  // @ts-expect-error 사유: 다중 관계의 대상 type도 계약에서 추출한다.
  data.update(posts, "id", { coverImage: { type: "users", id: "id" } });
}
