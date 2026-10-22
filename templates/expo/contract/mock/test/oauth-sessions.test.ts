/**
 * 소셜 로그인의 1회용 코드(POST /sessions의 oauthCode grant): 코드는 자기 codeVerifier로 한 번만, 60초
 * 안에 세션이 된다. FastAPI 템플릿의 auth/tests/test_oauth.py의 코드 교환 경우와 같다.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SECOND } from "../src/core/clock.ts";
import type { components } from "../src/generated/api.ts";
import { send } from "./accounts.ts";
import { exchange, me, pkce, social } from "./oauth.ts";
import { codesOf, errorsOf, testApp, testClock } from "./support.ts";

type SessionWithTokensResource = components["schemas"]["SessionWithTokensResource"];

describe("oauthCode grant", () => {
  it("세션을 열고 로그인을 감사 로그(method oauth, provider)에 남긴다", async () => {
    const { app, state } = testApp();
    const back = await social(app, "kakao", "audited");
    const created = await exchange(app, back.code, back.verifier, { "User-Agent": "phone" });
    expect(created.status).toBe(201);
    const { data } = (await created.json()) as { data: SessionWithTokensResource };
    const userId = data.relationships.user.data?.id ?? "";
    expect(data.attributes).toMatchObject({ current: true, userAgent: "phone" });
    expect(data.attributes.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const listed = await send(app, "GET", "/api/v1/sessions", {
      token: data.attributes.accessToken,
    });
    expect(listed.status).toBe(200);
    expect(state.store.auditLogs.at(-1)).toMatchObject({
      action: "session.login_succeeded",
      actorId: userId,
      targetType: "users",
      targetId: userId,
      metadata: { method: "oauth", provider: "kakao" },
      ipAddress: null,
    });
  });

  it("다른 verifier로는 바꾸지 못하고, 시도만으로 코드는 쓴 것이 된다(로그인 CSRF 방지)", async () => {
    const { app } = testApp();
    const back = await social(app, "google", "g-csrf");
    const wrong = await exchange(app, back.code, pkce().verifier);
    expect(await errorsOf(wrong, 401)).toEqual([
      {
        status: "401",
        code: "auth.oauth_code_invalid",
        title: "Unauthorized",
        detail: "The sign-in code is wrong or has expired.",
      },
    ]);
    const right = await exchange(app, back.code, back.verifier);
    expect(await codesOf(right, 401)).toEqual(["auth.oauth_code_invalid"]);
  });

  it.each([
    ["", "빈 값"],
    ["a".repeat(42), "42자"],
    ["a".repeat(129), "129자"],
    [`${"a".repeat(42)}+`, "unreserved 밖의 글자"],
  ])("verifier가 RFC 7636 모양이 아니면(%#: %s) challenge와 맞아도 401이다", async (verifier) => {
    const { app } = testApp();
    const back = await social(app, "google", randomUUID(), { verifier });
    expect(back.code).toBeDefined();
    expect(await codesOf(await exchange(app, back.code, verifier), 401)).toEqual([
      "auth.oauth_code_invalid",
    ]);
  });

  it("verifier는 unreserved 글자(._~-) 43~128자를 받는다", async () => {
    const { app } = testApp();
    for (const verifier of ["._~-".repeat(11).slice(0, 43), "Az09._~-".repeat(16)]) {
      const back = await social(app, "naver", randomUUID(), { verifier });
      expect((await exchange(app, back.code, verifier)).status).toBe(201);
    }
  });

  it("코드는 한 번만 세션이 되고 60초 뒤 만료된다", async () => {
    const clock = testClock();
    const { app } = testApp({}, { clock });
    const back = await social(app, "google", "g-once");
    expect((await exchange(app, back.code, back.verifier)).status).toBe(201);
    const reused = await exchange(app, back.code, back.verifier);
    expect(await codesOf(reused, 401)).toEqual(["auth.oauth_code_invalid"]);
    // 시계는 부를 때마다 1마이크로초씩 가므로 1밀리초를 남긴다.
    const early = await social(app, "google", "g-early");
    clock.advance(60 * SECOND - 1000);
    expect((await exchange(app, early.code, early.verifier)).status).toBe(201);
    const late = await social(app, "google", "g-late");
    clock.advance(60 * SECOND);
    const expired = await exchange(app, late.code, late.verifier);
    expect(await codesOf(expired, 401)).toEqual(["auth.oauth_code_invalid"]);
  });

  it("코드를 받은 뒤 비활성화된 계정은 403 auth.account_deactivated, 탈퇴한 계정은 401이다", async () => {
    const { app, state } = testApp();
    const user = await me(app, await social(app, "naver", "n-later"));
    const row = state.store.users.get(user.id);
    if (row === undefined) throw new Error("계정이 없다");
    const deactivated = await social(app, "naver", "n-later");
    row.status = "deactivated";
    const refused = await exchange(app, deactivated.code, deactivated.verifier);
    expect(await errorsOf(refused, 403)).toEqual([
      {
        status: "403",
        code: "auth.account_deactivated",
        title: "Forbidden",
        detail: "The account is deactivated.",
      },
    ]);
    row.status = "active";
    const pending = await social(app, "naver", "n-later");
    const fresh = await me(app, await social(app, "naver", "n-later"));
    expect((await send(app, "DELETE", "/api/v1/me", { token: fresh.accessToken })).status).toBe(
      204,
    );
    const left = await exchange(app, pending.code, pending.verifier);
    expect(await codesOf(left, 401)).toEqual(["auth.oauth_code_invalid"]);
  });
});
