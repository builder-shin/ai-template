/**
 * 감사 로그 API: 권한, 최신순 목록, 필터(행위자, 행위, 대상 종류, 기간), 행위자 포함(공개 사용자), 단건,
 * 틀린 필터. FastAPI 템플릿의 audit_logs/tests/test_api.py와 같은 경우를 본다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AuditLogRow } from "../src/core/audit.ts";
import { HOUR, type Instant } from "../src/core/clock.ts";
import { uuid7 } from "../src/core/ids.ts";
import type { MockState } from "../src/state.ts";
import { newAccount, passwordGrant, send, type SignedIn, userWith } from "./accounts.ts";
import { codesOf, errorsOf, testApp } from "./support.ts";

type App = ReturnType<typeof testApp>["app"];

const AUDIT_LOGS = "/api/v1/audit-logs";
const BASE = Date.UTC(2026, 0, 1) * 1000;

interface LogList {
  data: {
    id: string;
    attributes: Record<string, unknown>;
    relationships: { actor: unknown };
  }[];
  included?: unknown[];
}

function addLog(state: MockState, row: Partial<AuditLogRow> & Pick<AuditLogRow, "action">): string {
  const full: AuditLogRow = {
    id: uuid7(),
    actorId: null,
    targetType: null,
    targetId: null,
    metadata: {},
    ipAddress: null,
    createdAt: BASE,
    ...row,
  };
  state.store.auditLogs.push(full);
  return full.id;
}

/** URL에 넣을 RFC 3339 시각. */
function at(instant: Instant): string {
  return encodeURIComponent(new Date(instant / 1000).toISOString().replace(".000Z", "Z"));
}

async function listed(app: App, reader: SignedIn, query: string): Promise<LogList> {
  const response = await send(app, "GET", `${AUDIT_LOGS}${query}`, { token: reader.accessToken });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as LogList;
}

function ids(body: LogList): string[] {
  return body.data.map((resource) => resource.id);
}

describe("감사 로그", () => {
  it("audit-logs:read가 있어야 본다", async () => {
    const { app, state } = testApp();
    const member = await userWith(app, state, []);
    expect(await codesOf(await send(app, "GET", AUDIT_LOGS), 401)).toEqual([
      "auth.unauthenticated",
    ]);
    const denied = await send(app, "GET", AUDIT_LOGS, { token: member.accessToken });
    expect(await codesOf(denied, 403)).toEqual(["permission.denied"]);
  });

  it("최신순으로 주고, 필터로 거르고, 행위자를 공개 사용자로 포함한다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["audit-logs:read"]);
    const alice = newAccount(state, { name: "앨리스" });
    const [roleId, userId] = [randomUUID(), randomUUID()];
    const created = addLog(state, {
      action: "role.created",
      actorId: alice.id,
      targetType: "roles",
      targetId: roleId,
      metadata: { name: "editor" },
      ipAddress: "203.0.113.7",
      createdAt: BASE,
    });
    const deactivated = addLog(state, {
      action: "user.deactivated",
      actorId: alice.id,
      targetType: "users",
      targetId: userId,
      createdAt: BASE + HOUR,
    });
    const failed = addLog(state, {
      action: "session.login_failed",
      metadata: { identifierHash: "0".repeat(64) },
      createdAt: BASE + 2 * HOUR,
    });
    const window = `?filter%5BcreatedFrom%5D=${at(BASE)}&filter%5BcreatedTo%5D=${at(BASE + 3 * HOUR)}`;
    const newestFirst = await listed(app, reader, `${window}&include=actor`);
    expect(ids(newestFirst)).toEqual([failed, deactivated, created]);
    expect(newestFirst.data[2]?.attributes).toEqual({
      action: "role.created",
      targetType: "roles",
      targetId: roleId,
      metadata: { name: "editor" },
      ipAddress: "203.0.113.7",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(newestFirst.data[0]?.relationships.actor).toEqual({ data: null });
    expect(newestFirst.included).toEqual([
      {
        type: "users",
        id: alice.id,
        attributes: { name: "앨리스" },
        relationships: { avatar: { data: null } },
      },
    ]);
    expect(ids(await listed(app, reader, `${window}&sort=createdAt`))).toEqual([
      created,
      deactivated,
      failed,
    ]);
    const filtered = (filter: string) => listed(app, reader, `${window}&${filter}`);
    expect(ids(await filtered(`filter%5Bactor%5D=${alice.id}`))).toEqual([deactivated, created]);
    expect(ids(await filtered("filter%5Baction%5D=session.login_failed"))).toEqual([failed]);
    expect(ids(await filtered("filter%5BtargetType%5D=roles"))).toEqual([created]);
    const between = `?filter%5BcreatedFrom%5D=${at(BASE + HOUR)}&filter%5BcreatedTo%5D=${at(BASE + 2 * HOUR)}`;
    expect(ids(await listed(app, reader, between))).toEqual([deactivated]);
  });

  it("기간은 시간대와 Unix 시각으로도 준다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["audit-logs:read"]);
    const log = addLog(state, { action: "role.deleted", createdAt: BASE + HOUR });
    const since = (value: string) =>
      listed(app, reader, `?filter%5Baction%5D=role.deleted&filter%5BcreatedFrom%5D=${value}`);
    expect(ids(await since(encodeURIComponent("2026-01-01T10:00:00+09:00")))).toEqual([log]);
    expect(ids(await since(String((BASE + HOUR) / 1_000_000)))).toEqual([log]);
    expect(ids(await since(String((BASE + HOUR) / 1_000_000 + 1)))).toEqual([]);
  });

  it("metadata는 FastAPI의 JSONB처럼 키를 (길이, 바이트) 순서로 준다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["audit-logs:read"]);
    const email = newAccount(state).email ?? "";
    await send(app, "POST", "/api/v1/sessions", { document: passwordGrant(email, "wrong-one") });
    const body = await listed(app, reader, "?filter%5Baction%5D=session.login_failed");
    const metadata = body.data[0]?.attributes.metadata as Record<string, unknown>;
    expect(Object.keys(metadata)).toEqual(["reason", "identifierHash"]);
  });

  it("단건은 행위자를 포함하고, 없으면 404다", async () => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["audit-logs:read"]);
    const actor = newAccount(state);
    const logId = addLog(state, { action: "role.deleted", actorId: actor.id });
    const response = await send(app, "GET", `${AUDIT_LOGS}/${logId}?include=actor`, {
      token: reader.accessToken,
    });
    const body = (await response.json()) as { data: { id: string }; included: { id: string }[] };
    expect([body.data.id, body.included.map((user) => user.id)]).toEqual([logId, [actor.id]]);
    const missing = randomUUID();
    const notFound = await send(app, "GET", `${AUDIT_LOGS}/${missing}`, {
      token: reader.accessToken,
    });
    expect((await errorsOf(notFound, 404)).map((error) => error.detail)).toEqual([
      `Audit log ${missing} does not exist.`,
    ]);
  });

  it.each([
    [
      "filter[action]",
      "user.promoted",
      "Input should be 'session.login_succeeded', 'session.login_failed', 'session.all_revoked', " +
        "'user.password_changed', 'user.password_reset', 'user.roles_changed', 'user.deactivated', " +
        "'user.reactivated', 'user.deleted', 'role.created', 'role.updated', 'role.deleted' or " +
        "'post.deleted_by_admin'",
    ],
    ["filter[actor]", "alice", "Input should be a valid UUID, invalid character: found `l` at 2"],
    ["filter[createdFrom]", "2026-01-01T00:00:00", "Input should have timezone info"],
    [
      "filter[createdTo]",
      "2026-13-01T00:00:00Z",
      "Input should be a valid datetime or date, month value is outside expected range of 1-12",
    ],
  ])("%s=%s는 400 jsonapi.invalid_query다", async (parameter, value, detail) => {
    const { app, state } = testApp();
    const reader = await userWith(app, state, ["audit-logs:read"]);
    const query = `?${encodeURIComponent(parameter)}=${encodeURIComponent(value)}`;
    const response = await send(app, "GET", `${AUDIT_LOGS}${query}`, { token: reader.accessToken });
    const errors = await errorsOf(response, 400);
    expect(errors.map((error) => [error.code, error.source, error.detail])).toEqual([
      ["jsonapi.invalid_query", { parameter }, detail],
    ]);
  });
});
