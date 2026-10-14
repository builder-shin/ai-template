import { expect, it, vi } from "vitest";
import type { Tx } from "../../../core/db/unit-of-work.js";
import { SessionsRepository } from "../index.js";
import { parseQuery } from "../../../core/jsonapi/query.js";
it("refresh 세션 잠금은 tagged SQL의 UUID 매개변수로 행 전체를 FOR UPDATE 조회한다", async () => {
  const row = { id: "session" };
  const query = vi.fn().mockResolvedValue([row]);
  const tx = { $queryRaw: query } as unknown as Tx;
  expect(await new SessionsRepository().lock(tx, "01900000-0000-7000-8000-000000000001")).toBe(row);
  const [segments, id] = query.mock.calls[0] as [TemplateStringsArray, string];
  expect(id).toBe("01900000-0000-7000-8000-000000000001");
  expect(segments.join("?").replace(/\s+/g, " ")).toContain(
    "FROM sessions WHERE id = ?::uuid FOR UPDATE",
  );
});
it("저장소 목록은 소유자·만료·폐기 필터와 지정 정렬 및 id 보조 정렬을 DB에 전달한다", async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const query = parseQuery("sort=-lastUsedAt,createdAt", { sort: ["createdAt", "lastUsedAt"] });
  const at = new Date("2026-10-14T01:00:00Z");
  await new SessionsRepository().active(
    { session: { findMany } } as unknown as Tx,
    "user",
    at,
    query,
  );
  expect(findMany).toHaveBeenCalledWith({
    where: { userId: "user", revokedAt: null, expiresAt: { gt: at } },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  });
});
it("refresh 사용·세션 폐기·마지막 로그인은 같은 전달된 tx에 저장한다", async () => {
  const update = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    refreshToken: { update },
    session: { updateMany },
    user: { update },
  } as unknown as Tx;
  const repository = new SessionsRepository();
  const at = new Date("2026-10-14T01:00:00Z");
  await repository.consumeRefresh(tx, "token", at);
  await repository.revoke(tx, ["s"], at, "logout");
  await repository.loginAt(tx, "u", at);
  expect(update.mock.calls).toEqual([
    [{ where: { id: "token" }, data: { usedAt: at } }],
    [{ where: { id: "u" }, data: { lastLoginAt: at } }],
  ]);
  expect(updateMany).toHaveBeenCalledWith({
    where: { id: { in: ["s"] }, revokedAt: null },
    data: { revokedAt: at, revokedReason: "logout" },
  });
});
