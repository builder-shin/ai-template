import { expect, it } from "vitest";
import { adminFixture } from "./admin-fixture.js";
import { errorCode } from "./session-fixture.js";
import { UsersAdminService } from "../../src/modules/users/index.js";
it.each(["roles", "status"] as const)(
  "활성 관리자 둘의 동시 %s 회수는 하나만 성공하고 한 명을 보존한다",
  async (kind) => {
    const f = await adminFixture(),
      second = await f.addUser("admin");
    const member = await f.unit.run((tx) =>
      tx.role.findUniqueOrThrow({ where: { name: "member" } }),
    );
    const data =
      kind === "roles"
        ? { relationships: { roles: { data: [{ type: "roles", id: member.id }] } } }
        : { attributes: { status: "deactivated" } };
    // 두 요청이 인증을 끝낸 뒤 실제 DB 트랜잭션에서 경쟁하게 한다.
    const service = f.app.get(UsersAdminService),
      update = service.update.bind(service);
    let arrived = 0,
      release = () => {};
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    service.update = async (...args) => {
      if (++arrived === 2) release();
      await ready;
      return update(...args);
    };
    const results = await Promise.all([
      f.patch("users", second.user.id, data),
      f.patch("users", f.user.id, data, second.session.attributes.accessToken),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(errorCode(results.find((r) => r.status === 422)?.text ?? "")).toBe(
      "role.last_admin_protected",
    );
    expect(
      await f.unit.run((tx) =>
        tx.user.count({
          where: { status: "active", roles: { some: { role: { name: "admin", system: true } } } },
        }),
      ),
    ).toBe(1);
  },
);
