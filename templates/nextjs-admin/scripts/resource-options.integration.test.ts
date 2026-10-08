import { expect, inject, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { seedFixture } from "./test/admin-fixture";
import { defineResource } from "../src/lib/resources/definition";
import { relationOptions } from "../src/lib/resources/options";
it("검색할 수 있는 대상은 첫 페이지만 한 번 읽고 검색 없는 대상은 끝까지 읽는다", async () => {
  const seed = await seedFixture(inject("mockBaseUrl"));
  const prefix = randomUUID();
  const ids: string[] = [];
  for (let i = 0; i < 22; i++)
    ids.push(
      (
        await seed.client.POST("/roles", {
          body: {
            data: { type: "roles", attributes: { name: `${prefix}-${i}`, permissions: [] } },
          },
        })
      ).data!.data.id,
    );
  const users = (search: boolean) =>
    defineResource({
      type: "users",
      permission: "users:manage",
      list: { columns: ["name"] },
      fields: { roles: { relation: { type: "roles", label: "name", search } } },
      edit: { permission: "users:manage", fields: { roles: "relation-many" } },
    });
  const request = vi.spyOn(seed.client, "request");
  expect(await relationOptions(seed.client, users(true), "roles", prefix)).toHaveLength(20);
  expect(request).toHaveBeenCalledTimes(1);
  const all = await relationOptions(seed.client, users(false), "roles");
  expect(all.map((option) => option.value)).toEqual(expect.arrayContaining(ids));
});
