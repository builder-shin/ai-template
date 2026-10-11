import { defineResource } from "../../src/lib/resources/definition";

// 등록하지 않는 데이터 계층 fixture다. 실제 글 관리 선언은 쓰기 화면을 제공하지 않는다.
export const postsFixture = defineResource({
  type: "posts",
  permission: "posts:manage",
  list: {
    columns: ["title", "author", "status"],
    filters: { "filter[q]": "text", "filter[status]": "enum", "filter[author]": "relation" },
    sort: { fields: ["title", "createdAt", "publishedAt"], default: "-createdAt" },
    include: ["author"],
  },
  detail: { fields: ["title", "body", "author", "coverImage", "status"] },
  create: {
    permission: "posts:create",
    fields: { title: "text", body: "textarea", status: "enum", coverImage: "relation" },
  },
  edit: {
    permission: "posts:manage",
    fields: { title: "text", status: "enum", coverImage: "relation" },
  },
  delete: { permission: "posts:manage" },
});

export const rolesFixture = defineResource({
  type: "roles",
  permission: "roles:read",
  fields: {
    permissions: { kind: "enum-many", values: ["posts:create", "posts:manage"] },
  },
  list: { columns: ["id", "name"] },
  detail: { fields: ["id", "permissions"] },
  create: {
    permission: "roles:manage",
    fields: { name: "text", permissions: "enum-many" },
  },
  edit: { permission: "roles:manage", fields: { permissions: "enum-many" } },
});
