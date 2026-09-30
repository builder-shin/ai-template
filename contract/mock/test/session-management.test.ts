/**
 * 내 세션 목록(정렬, 페이지, sparse fieldset), 로그아웃, 세션 하나 폐기, 다른 기기·전체 로그아웃과
 * 그때 나가는 session.revoked. FastAPI 템플릿의 test_sessions.py와 test_events.py와 같은 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { DAY } from "../src/core/clock.ts";
import { newUser, refreshGrant, type SignedIn, send, signIn } from "./accounts.ts";
import { codesOf, errorsOf, revokedReasons, TIMESTAMP, testApp, testClock } from "./support.ts";

const SESSIONS = "/api/v1/sessions";
const REVOCATIONS = "/api/v1/session-revocations";

interface SessionList {
  data: { id: string; attributes: Record<string, unknown> }[];
  links: Record<string, string | null>;
  meta: { page: Record<string, number> };
}

async function list(app: ReturnType<typeof testApp>["app"], user: SignedIn, query = "") {
  const response = await send(app, "GET", `${SESSIONS}${query}`, { token: user.accessToken });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as SessionList;
}

function revocation(scope: string) {
  return { data: { type: "session-revocations", attributes: { scope } } };
}

describe("세션 목록", () => {
  it("내 살아 있는 세션만 최근에 쓴 순서로 주고, 토큰은 담지 않는다", async () => {
    const { app, state } = testApp();
    const older = await newUser(app, state);
    const newer = await signIn(app, older.email, undefined, { "User-Agent": "laptop" });
    await newUser(app, state);
    const body = await list(app, newer);
    expect(body.data.map((session) => session.id)).toEqual([newer.sessionId, older.sessionId]);
    expect(body.data.map((session) => session.attributes.current)).toEqual([true, false]);
    expect(body.data[0]).toEqual({
      type: "sessions",
      id: newer.sessionId,
      attributes: {
        userAgent: "laptop",
        createdAt: expect.stringMatching(TIMESTAMP) as unknown,
        lastUsedAt: expect.stringMatching(TIMESTAMP) as unknown,
        current: true,
      },
      relationships: { user: { data: { type: "users", id: newer.userId } } },
    });
    expect(body.data[1]?.attributes.userAgent).toBeNull();
    const oldestFirst = await list(app, newer, "?sort=createdAt");
    expect(oldestFirst.data.map((session) => session.id)).toEqual([
      older.sessionId,
      newer.sessionId,
    ]);
  });

  it("refresh로 쓴 세션이 앞으로 온다", async () => {
    const { app, state } = testApp();
    const older = await newUser(app, state);
    const newer = await signIn(app, older.email);
    await send(app, "POST", SESSIONS, { document: refreshGrant(older.refreshToken) });
    const body = await list(app, newer);
    expect(body.data.map((session) => session.id)).toEqual([older.sessionId, newer.sessionId]);
  });

  it("만료된 세션은 목록에 없다", async () => {
    const clock = testClock();
    const { app, state } = testApp({}, { clock });
    const stale = await newUser(app, state);
    clock.advance(30 * DAY);
    const fresh = await signIn(app, stale.email);
    expect((await list(app, fresh)).data.map((session) => session.id)).toEqual([fresh.sessionId]);
  });

  it("페이지 메타와 요청 경로 기준의 상대 페이지 링크를 담는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    for (let count = 0; count < 4; count += 1) await signIn(app, user.email);
    const body = await list(app, user, "?sort=-createdAt&page%5Bsize%5D=2&page%5Bnumber%5D=2");
    expect(body.meta.page).toEqual({ number: 2, size: 2, total: 5, totalPages: 3 });
    const page = (number: number) =>
      `${SESSIONS}?sort=-createdAt&page%5Bsize%5D=2&page%5Bnumber%5D=${String(number)}`;
    expect(body.links).toEqual({ first: page(1), last: page(3), prev: page(1), next: page(3) });
    const past = await list(app, user, "?page%5Bnumber%5D=9");
    expect(past.data).toEqual([]);
    expect(past.links).toMatchObject({ prev: `${SESSIONS}?page%5Bnumber%5D=8`, next: null });
  });

  it("fields[sessions]로 속성을 고른다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const body = await list(app, user, "?fields%5Bsessions%5D=current");
    expect(body.data[0]).toEqual({
      type: "sessions",
      id: user.sessionId,
      attributes: { current: true },
      relationships: {},
    });
  });

  it.each([
    ["?include=user", "jsonapi.invalid_query", "include"],
    ["?sort=password", "jsonapi.unsupported_sort", "sort"],
    ["?filter%5Bcurrent%5D=true", "jsonapi.invalid_query", "filter[current]"],
    ["?page%5Bsize%5D=101", "jsonapi.invalid_query", "page[size]"],
  ])("틀린 쿼리 %s는 400이다", async (query, code, parameter) => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const response = await send(app, "GET", `${SESSIONS}${query}`, { token: user.accessToken });
    const errors = await errorsOf(response, 400);
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, { parameter }]]);
  });

  it("로그인하지 않으면 401 auth.unauthenticated와 WWW-Authenticate다", async () => {
    const { app } = testApp();
    const response = await send(app, "GET", SESSIONS);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await errorsOf(response, 401)).toEqual([
      {
        status: "401",
        code: "auth.unauthenticated",
        title: "Unauthorized",
        detail: "An access token is required (Authorization: Bearer <token>).",
      },
    ]);
  });
});

describe("로그아웃과 세션 폐기", () => {
  it("현재 세션만 로그아웃하고, 그 access token은 바로 막힌다", async () => {
    const { app, state } = testApp();
    const phone = await newUser(app, state);
    const laptop = await signIn(app, phone.email);
    const reasons = revokedReasons(state, phone.userId);
    const out = await send(app, "DELETE", `${SESSIONS}/current`, { token: phone.accessToken });
    expect([out.status, await out.text()]).toEqual([204, ""]);
    const blocked = await send(app, "GET", SESSIONS, { token: phone.accessToken });
    expect(await codesOf(blocked, 401)).toEqual(["auth.token_invalid"]);
    expect((await list(app, laptop)).data.map((session) => session.id)).toEqual([laptop.sessionId]);
    expect(reasons()).toEqual([["session.revoked", "logout"]]);
  });

  it("내 세션 하나를 골라 폐기한다. 남의 세션, 없는 세션, 틀린 id는 404다", async () => {
    const { app, state } = testApp();
    const mine = await newUser(app, state);
    const spare = await signIn(app, mine.email);
    const theirs = await newUser(app, state);
    const reasons = revokedReasons(state, mine.userId);
    const remove = (id: string) =>
      send(app, "DELETE", `${SESSIONS}/${id}`, { token: mine.accessToken });
    const foreign = await remove(theirs.sessionId);
    expect(await errorsOf(foreign, 404)).toEqual([
      {
        status: "404",
        code: "resource.not_found",
        title: "Not Found",
        detail: `Session ${theirs.sessionId} does not exist.`,
      },
    ]);
    expect(await codesOf(await remove("0199a0b2-8c3e-7abc-8def-0123456789ab"), 404)).toEqual([
      "resource.not_found",
    ]);
    expect(await errorsOf(await remove("not-a-uuid"), 404)).toEqual([
      {
        status: "404",
        code: "resource.not_found",
        title: "Not Found",
        detail: "Resource not found.",
      },
    ]);
    expect((await remove(`{${spare.sessionId.toUpperCase()}}`)).status).toBe(204);
    expect(await codesOf(await remove(spare.sessionId), 404)).toEqual(["resource.not_found"]);
    const blocked = await send(app, "GET", SESSIONS, { token: spare.accessToken });
    expect(blocked.status).toBe(401);
    expect(reasons()).toEqual([["session.revoked", "revoked"]]);
  });

  it("자기 세션을 id로 지우면 로그아웃이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const reasons = revokedReasons(state, user.userId);
    const path = `${SESSIONS}/${user.sessionId}`;
    expect((await send(app, "DELETE", path, { token: user.accessToken })).status).toBe(204);
    expect(reasons()).toEqual([["session.revoked", "logout"]]);
  });
});

describe("다른 기기·전체 로그아웃", () => {
  it.each([
    ["others", 2, true],
    ["all", 3, false],
  ] as const)("scope %s는 %i개를 폐기한다", async (scope, count, currentAlive) => {
    const { app, state } = testApp();
    const current = await newUser(app, state);
    const others = [await signIn(app, current.email), await signIn(app, current.email)];
    const reasons = revokedReasons(state, current.userId);
    const response = await send(app, "POST", REVOCATIONS, {
      document: revocation(scope),
      token: current.accessToken,
    });
    expect(response.status).toBe(201);
    const { data } = (await response.json()) as {
      data: { type: string; id: string; attributes: Record<string, unknown> };
    };
    expect(data).toEqual({
      type: "session-revocations",
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/) as unknown,
      attributes: {
        scope,
        revokedCount: count,
        createdAt: expect.stringMatching(TIMESTAMP) as unknown,
      },
    });
    const alive = await send(app, "GET", SESSIONS, { token: current.accessToken });
    expect(alive.status === 200).toBe(currentAlive);
    for (const other of others) {
      expect((await send(app, "GET", SESSIONS, { token: other.accessToken })).status).toBe(401);
    }
    expect(reasons()).toEqual([["session.revoked", "revoked"]]);
    const audit = state.store.auditLogs.filter((row) => row.action === "session.all_revoked");
    expect(audit.map((row) => [row.actorId, row.targetId, row.metadata])).toEqual(
      scope === "all" ? [[current.userId, current.userId, { revokedCount: count }]] : [],
    );
  });

  it("폐기할 세션이 없으면 0개이고 이벤트를 보내지 않는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const reasons = revokedReasons(state, user.userId);
    const response = await send(app, "POST", REVOCATIONS, {
      document: revocation("others"),
      token: user.accessToken,
    });
    const { data } = (await response.json()) as { data: { attributes: { revokedCount: number } } };
    expect(data.attributes.revokedCount).toBe(0);
    expect(reasons()).toEqual([]);
  });

  it("scope가 틀리면 422이고, 로그인하지 않으면 본문보다 먼저 401이다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const wrong = await send(app, "POST", REVOCATIONS, {
      document: revocation("some"),
      token: user.accessToken,
    });
    const errors = await errorsOf(wrong, 422);
    expect(errors.map((error) => [error.code, error.source])).toEqual([
      ["validation.invalid_choice", { pointer: "/data/attributes/scope" }],
    ]);
    expect(
      await codesOf(await send(app, "POST", REVOCATIONS, { document: revocation("some") }), 401),
    ).toEqual(["auth.unauthenticated"]);
  });
});
