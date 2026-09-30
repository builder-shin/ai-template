import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api, codes, LONE_SURROGATE, newUser, signIn, target, uniqueEmail } from "./support.ts";

function refresh(refreshToken: string) {
  return api().POST("/api/v1/sessions", {
    body: { data: { type: "sessions", attributes: { grantType: "refreshToken", refreshToken } } },
  });
}

function revoke(accessToken: string, scope: "others" | "all") {
  return api(accessToken).POST("/api/v1/session-revocations", {
    body: { data: { type: "session-revocations", attributes: { scope } } },
  });
}

async function meStatus(accessToken: string): Promise<number> {
  return (await api(accessToken).GET("/api/v1/me")).response.status;
}

describe(`세션 (${target.name})`, () => {
  it("로그인한 세션은 내 세션 목록에 현재 세션으로 보인다", async () => {
    const user = await newUser();
    const { data, response } = await user.api.GET("/api/v1/sessions");
    expect(response.status).toBe(200);
    const mine = data?.data.find((session) => session.id === user.sessionId);
    expect(mine?.attributes.current).toBe(true);
  });

  it("틀린 비밀번호로는 로그인하지 못한다", async () => {
    const user = await newUser();
    const password = "wrong-password"; // betterleaks:allow 틀린 비밀번호
    const { error, response } = await api().POST("/api/v1/sessions", {
      body: {
        data: {
          type: "sessions",
          attributes: { grantType: "password", email: user.email, password },
        },
      },
    });
    expect(response.status).toBe(401);
    expect(codes(error)).toEqual(["auth.invalid_credentials"]);
  });

  it("비밀번호에 짝 없는 서로게이트가 있어도 계정이 있든 없든 틀린 비밀번호와 같은 401이다", async () => {
    const user = await newUser();
    for (const email of [user.email, uniqueEmail("nobody")]) {
      const { error, response } = await api().POST("/api/v1/sessions", {
        body: {
          data: {
            type: "sessions",
            attributes: { grantType: "password", email, password: LONE_SURROGATE },
          },
        },
      });
      expect(response.status, email).toBe(401);
      expect(codes(error), email).toEqual(["auth.invalid_credentials"]);
    }
  });

  it("refresh token은 한 번만 쓴다. 쓴 것을 다시 쓰면 그 세션을 통째로 폐기한다", async () => {
    const user = await newUser();
    const renewed = await refresh(user.refreshToken);
    expect(renewed.response.status).toBe(201);
    const next = renewed.data?.data.attributes;
    expect(next?.refreshToken).not.toBe(user.refreshToken);
    expect(await meStatus(next?.accessToken ?? "")).toBe(200);

    const reused = await refresh(user.refreshToken);
    expect(reused.response.status).toBe(401);
    expect(codes(reused.error)).toEqual(["auth.refresh_token_reused"]);
    expect(await meStatus(next?.accessToken ?? "")).toBe(401);
    expect((await refresh(next?.refreshToken ?? "")).response.status).toBe(401);
  });

  it("현재 세션에서 로그아웃하면 그 access token은 더 쓰지 못한다", async () => {
    const user = await newUser();
    expect((await user.api.DELETE("/api/v1/sessions/current")).response.status).toBe(204);
    expect(await meStatus(user.accessToken)).toBe(401);
  });

  it("다른 기기의 세션을 골라 폐기한다", async () => {
    const user = await newUser();
    const other = await signIn(user);
    const { response } = await user.api.DELETE("/api/v1/sessions/{id}", {
      params: { path: { id: other.sessionId } },
    });
    expect(response.status).toBe(204);
    expect(await meStatus(other.accessToken)).toBe(401);
    expect(await meStatus(user.accessToken)).toBe(200);
    const missing = await user.api.DELETE("/api/v1/sessions/{id}", {
      params: { path: { id: randomUUID() } },
    });
    expect(missing.response.status).toBe(404);
  });

  it("다른 기기에서 로그아웃하면 현재 세션만 남고, 모든 기기에서 로그아웃하면 현재 세션도 끝난다", async () => {
    const user = await newUser();
    const other = await signIn(user);
    const others = await revoke(user.accessToken, "others");
    expect(others.response.status).toBe(201);
    expect(others.data?.data.attributes.revokedCount).toBe(1);
    expect(await meStatus(other.accessToken)).toBe(401);
    expect(await meStatus(user.accessToken)).toBe(200);

    const all = await revoke(user.accessToken, "all");
    expect(all.data?.data.attributes).toMatchObject({ scope: "all", revokedCount: 1 });
    expect(await meStatus(user.accessToken)).toBe(401);
  });

  it("로그인하지 않으면 세션 목록을 보지 못한다", async () => {
    const { error, response } = await api().GET("/api/v1/sessions");
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toMatch(/^Bearer/);
    expect(codes(error)).toEqual(["auth.unauthenticated"]);
  });
});
