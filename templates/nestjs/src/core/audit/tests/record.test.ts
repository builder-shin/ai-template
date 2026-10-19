import { expect, it } from "vitest";
import { recordAudit } from "../record.js";
import { AUDIT_LOG_ACTIONS, type AuditLogAction } from "../actions.js";
import { components } from "../../jsonapi/schemas.js";
import type { Tx } from "../../db/unit-of-work.js";

it("감사는 전달한 트랜잭션에 대상·식별자·메타를 기록한다", async () => {
  const rows: unknown[] = [];
  const tx = {
    auditLog: {
      create: ({ data }: { data: unknown }) => {
        rows.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as Tx;
  await recordAudit(tx, {
    action: "user.roles_changed",
    actorUserId: "u1",
    target: { type: "users", id: "u2" },
    identifierHash: "식별자",
    meta: { roles: ["member"] },
  });
  expect(rows).toEqual([
    {
      action: "user.roles_changed",
      actorUserId: "u1",
      targetType: "users",
      targetId: "u2",
      identifierHash: "식별자",
      meta: { roles: ["member"] },
    },
  ]);
});
it("대상 없는 감사도 기본 빈 메타를 저장하고 계약 행위만 허용한다", async () => {
  const rows: { action: string; meta: object }[] = [];
  const tx = {
    auditLog: {
      create: ({ data }: { data: { action: string; meta: object } }) => {
        rows.push(data);
        return Promise.resolve(data);
      },
    },
  } as unknown as Tx;
  for (const action of AUDIT_LOG_ACTIONS) await recordAudit(tx, { action });
  expect(rows.map((r) => r.action)).toEqual([
    "session.login_succeeded",
    "session.login_failed",
    "session.all_revoked",
    "user.password_changed",
    "user.password_reset",
    "user.roles_changed",
    "user.deactivated",
    "user.reactivated",
    "user.deleted",
    "role.created",
    "role.updated",
    "role.deleted",
    "post.deleted_by_admin",
  ]);
  expect(rows.every((r) => Object.keys(r.meta).length === 0)).toBe(true);
  await expect(recordAudit(tx, { action: "test.invalid" as AuditLogAction })).rejects.toThrow();
  expect(rows).toHaveLength(13);
  expect(components().get("AuditLogAction")?.schema.safeParse("test.invalid").success).toBe(false);
});
