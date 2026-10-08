import "server-only";
import { defineResource } from "../../lib/resources/definition";
import { publish, unpublish } from "./actions";

export default defineResource({
  type: "posts",
  permission: "posts:manage",
  fields: {
    body: { kind: "textarea" },
    status: { kind: "enum", values: ["draft", "published"] },
    author: { kind: "relation", relation: { type: "users", label: "name", search: true } },
    coverImage: { kind: "file" },
  },
  list: {
    columns: ["title", "author", "status", "publishedAt", "createdAt"],
    filters: { "filter[q]": "text", "filter[status]": "enum", "filter[author]": "relation" },
    sort: { fields: ["createdAt", "publishedAt", "title"], default: "-createdAt" },
    include: ["author", "coverImage"],
  },
  detail: { fields: ["title", "body", "status", "author", "coverImage", "publishedAt"] },
  actions: [publish, unpublish],
  delete: { permission: "posts:manage" },
  realtime: { channel: "posts:all" },
});
