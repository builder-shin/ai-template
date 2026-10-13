import { expect, it } from "vitest";
import { z } from "zod";
import {
  paginationLinksSchema,
  pageMetaSchema,
  collectionMetaSchema,
} from "../collection-schemas.js";
import { components, registerComponent } from "../schemas.js";
import { buildOpenApi } from "../openapi/emit.js";
import { collectionDocument } from "../document.js";

it("core만 가져와도 공용 페이지 컴포넌트의 이름과 계약 형태를 생성한다", () => {
  const doc = buildOpenApi([], components());
  expect(doc.components.schemas).toMatchObject({
    PaginationLinks: {
      type: "object",
      required: ["first", "prev", "next", "last"],
      properties: {
        first: { type: "string", format: "uri-reference" },
        prev: { format: "uri-reference" },
      },
    },
    PageMeta: {
      type: "object",
      properties: {
        number: { type: "integer", format: "int32" },
        total: { type: "integer", format: "int32" },
      },
    },
    CollectionMeta: { properties: { page: { $ref: "#/components/schemas/PageMeta" } } },
  });
});
it("공용 스키마는 독립 소비자 둘이 같은 참조로 재사용하고 중복 등록은 거절한다", () => {
  expect(components().get("CollectionMeta")?.schema).toBe(collectionMetaSchema);
  registerComponent("CorePageConsumerA", z.object({ meta: collectionMetaSchema }));
  registerComponent("CorePageConsumerB", z.object({ meta: collectionMetaSchema }));
  const doc = buildOpenApi([], components());
  for (const name of ["CorePageConsumerA", "CorePageConsumerB"])
    expect(doc.components.schemas[name]).toMatchObject({
      properties: { meta: { $ref: "#/components/schemas/CollectionMeta" } },
    });
  expect(() => registerComponent("CollectionMeta", z.object({}))).toThrow(
    "컴포넌트 이름이 중복된다",
  );
});
it("공용 스키마는 컬렉션 빌더의 실제 링크·메타를 받아들이고 잘못된 숫자와 링크를 거절한다", () => {
  const doc = collectionDocument([], {
    total: 0,
    page: { number: 1, size: 20 },
    path: "/api/v1/core-fixture",
    search: "",
  });
  expect(paginationLinksSchema.safeParse(doc.links).success).toBe(true);
  expect(collectionMetaSchema.safeParse(doc.meta).success).toBe(true);
  expect(pageMetaSchema.safeParse({ ...doc.meta.page, number: "1" }).success).toBe(false);
  expect(paginationLinksSchema.safeParse({ ...doc.links, prev: 42 }).success).toBe(false);
});
