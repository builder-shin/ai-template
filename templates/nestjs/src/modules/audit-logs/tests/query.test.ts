import { afterEach, expect, it } from "vitest";
import { parseQuery } from "../../../core/jsonapi/query.js";
import { AUDIT_LOG_ACTIONS } from "../../../core/audit/actions.js";
import { listAuditLogs, AuditLogsService, AuditLogsRepository } from "../index.js";
import { adminFixture, admin, uid, otherId, at } from "../../users/tests/admin-fixture.js";
const fixtures: ReturnType<typeof adminFixture>[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.close();
});
function setup() {
  const f = adminFixture();
  fixtures.push(f);
  return { f, service: new AuditLogsService(f.unit, new AuditLogsRepository(), f.includes) };
}
it.each(AUDIT_LOG_ACTIONS)("행위 필터 %s를 실제로 받는다", (action) => {
  expect(parseQuery("filter[action]=" + action, listAuditLogs.query).filter.action).toBe(action);
});
it.each(["role.unknown", "user.activated", ""])("계약 밖의 행위 %s는 400이다", (action) => {
  expect(() => parseQuery("filter[action]=" + action, listAuditLogs.query)).toThrow(
    expect.objectContaining({
      init: expect.objectContaining({ status: 400, code: "jsonapi.invalid_query" }) as unknown,
    }),
  );
});
it("기간 시작이 종료보다 늦으면 400이며 저장소를 조회하지 않는다", async () => {
  const { f, service } = setup();
  await expect(
    service.list(
      admin,
      {
        filter: { createdFrom: "2026-10-16T00:00:00Z", createdTo: "2026-10-15T00:00:00Z" },
        sort: [],
        include: [],
        fields: {},
        page: { number: 1, size: 20 },
      },
      "",
    ),
  ).rejects.toMatchObject({ init: { status: 400, code: "jsonapi.invalid_query" } });
  expect(f.trace).toEqual([]);
});
it("행위자와 대상과 포함 시작·제외 종료 필터를 적용하고 공개 actor만 포함한다", async () => {
  const { f, service } = setup();
  f.state.audits.push(
    ...[
      {
        id: "a",
        action: "role.created",
        actorUserId: uid,
        targetType: "roles",
        targetId: "r",
        meta: { safe: true },
        createdAt: at,
      },
      {
        id: "b",
        action: "role.created",
        actorUserId: uid,
        targetType: "roles",
        targetId: "r",
        meta: {},
        createdAt: new Date(at.getTime() + 1000),
      },
      {
        id: "c",
        action: "role.created",
        actorUserId: otherId,
        targetType: "roles",
        targetId: "r",
        meta: {},
        createdAt: at,
      },
    ],
  );
  const q = parseQuery(
    "filter[actor]=" +
      uid +
      "&filter[action]=role.created&filter[targetType]=roles&filter[createdFrom]=2026-10-15T00:00:00Z&filter[createdTo]=2026-10-15T00:00:01Z&include=actor",
    listAuditLogs.query,
  );
  expect(await service.list(admin, q, "include=actor")).toEqual(
    expect.objectContaining({
      data: [
        {
          type: "audit-logs",
          id: "a",
          attributes: {
            action: "role.created",
            targetType: "roles",
            targetId: "r",
            metadata: { safe: true },
            ipAddress: null,
            createdAt: at.toISOString(),
          },
          relationships: { actor: { data: { type: "users", id: uid } } },
        },
      ],
      included: [
        {
          type: "users",
          id: uid,
          attributes: { name: "관리자" },
          relationships: { avatar: { data: null } },
        },
      ],
    }),
  );
});
it("감사 조회는 희소 필드를 적용하고 없는 로그는 404다", async () => {
  const { f, service } = setup();
  f.state.audits.push({
    id: "a",
    action: "session.login_failed",
    actorUserId: null,
    targetType: null,
    targetId: null,
    meta: {},
    createdAt: at,
  });
  const q = {
    filter: {},
    sort: [],
    include: [],
    fields: { "audit-logs": ["action", "actor"] },
    page: { number: 1, size: 20 },
  };
  expect(await service.get(admin, "a", q)).toEqual({
    data: {
      type: "audit-logs",
      id: "a",
      attributes: { action: "session.login_failed" },
      relationships: { actor: { data: null } },
    },
  });
  await expect(service.get(admin, "missing", q)).rejects.toMatchObject({
    init: { status: 404, code: "resource.not_found" },
  });
});
it.each([
  ["users", "u", "users", "u"],
  ["roles", null, "roles", null],
  ["posts", "p", "posts", "p"],
  ["sessions", "s", null, null],
  ["future", "f", null, null],
  [null, "orphan", null, null],
])(
  "저장 대상 %s %s의 공개 투영은 %s %s다",
  async (targetType, targetId, expectedType, expectedId) => {
    const { f, service } = setup();
    f.state.audits.push({
      id: "a",
      action: "session.login_succeeded",
      targetType,
      targetId,
      actorUserId: uid,
      identifierHash: "internal-only",
      meta: { method: "password" },
      createdAt: at,
    });
    const q = { filter: {}, sort: [], include: [], fields: {}, page: { number: 1, size: 20 } };
    const doc = await service.get(admin, "a", q);
    expect(doc).toMatchObject({
      data: {
        attributes: {
          targetType: expectedType,
          targetId: expectedId,
          metadata: { method: "password" },
          ipAddress: null,
        },
        relationships: { actor: { data: { type: "users", id: uid } } },
      },
    });
    expect(JSON.stringify(doc)).not.toContain("internal-only");
    expect(f.state.audits[0]).toMatchObject({ targetType, targetId, meta: { method: "password" } });
  },
);
