import { expect, inject, it } from "vitest";
import { randomUUID } from "node:crypto";
import { seedFixture } from "./test/admin-fixture";
import { defineResource } from "../src/lib/resources/definition";
import { relationOptions } from "../src/lib/resources/options";
const resource = defineResource({
  type: "users",
  permission: "users:manage",
  list: { columns: ["name"] },
  fields: { roles: { relation: { type: "roles", label: "name", search: true } } },
  edit: { permission: "users:manage", fields: { roles: "relation-many" } },
});
it("대상 선택은 두 번째 페이지까지 읽어 모든 검색 결과를 제공한다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const prefix = randomUUID();
  const ids: string[] = [];
  for (let i = 0; i < 22; i++) {
    const document = (
      await seed.client.POST("/roles", {
        body: { data: { type: "roles", attributes: { name: `${prefix}-${i}`, permissions: [] } } },
      })
    ).data!;
    ids.push(document.data.id);
  }
  const options = await relationOptions(seed.client, resource, "roles", prefix);
  expect(options.map((item) => item.value).sort()).toEqual(ids.sort());
});
