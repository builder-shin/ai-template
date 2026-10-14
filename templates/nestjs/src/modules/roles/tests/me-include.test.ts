import { expect, it } from "vitest";
import { RolesRepository } from "../index.js";
import type { Tx } from "../../../core/db/unit-of-work.js";
it("내 정보의 역할 include는 저장한 생성과 수정 시각을 ISO로 돌려준다", async () => {
  const tx = {
    role: {
      findMany: () =>
        Promise.resolve([
          {
            id: "role",
            name: "member",
            description: null,
            system: true,
            permissions: ["posts:create"],
            createdAt: new Date("2026-10-01T02:03:04Z"),
            updatedAt: new Date("2026-10-02T03:04:05Z"),
          },
        ]),
    },
  } as unknown as Tx;
  expect(await new RolesRepository().load(tx, ["role"])).toEqual([
    {
      type: "roles",
      id: "role",
      attributes: {
        name: "member",
        description: null,
        isSystem: true,
        permissions: ["posts:create"],
        createdAt: "2026-10-01T02:03:04.000Z",
        updatedAt: "2026-10-02T03:04:05.000Z",
      },
    },
  ]);
});
