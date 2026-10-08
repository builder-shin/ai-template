/**
 * 내 정보(GET /me): 계정, 역할 관계와 포함 리소스, 실제 권한(meta.permissions), sparse fieldset.
 * FastAPI 템플릿의 users/tests/test_me.py 가운데 읽기에 해당하는 경우를 본다.
 */

import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../src/core/permissions.ts";
import { findRoleByName } from "../src/modules/roles/service.ts";
import { newUser, send, signIn } from "./accounts.ts";
import { codesOf, errorsOf, TIMESTAMP, testApp } from "./support.ts";

const ME = "/api/v1/me";

interface MeDocument {
  data: { attributes: Record<string, unknown>; relationships: Record<string, unknown> };
  included?: { type: string; id: string; attributes: Record<string, unknown> }[];
  meta: { permissions: string[] };
}

async function me(app: ReturnType<typeof testApp>["app"], token: string, query = "") {
  const response = await send(app, "GET", `${ME}${query}`, { token });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()) as MeDocument;
}

describe("GET /me", () => {
  it("내 계정과 역할, 실제 권한을 준다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const member = findRoleByName(state.store, "member");
    const body = await me(app, user.accessToken);
    expect(body).toEqual({
      data: {
        type: "users",
        id: user.userId,
        attributes: {
          email: user.email,
          name: "가입자",
          locale: "ko",
          status: "active",
          emailVerifiedAt: expect.stringMatching(TIMESTAMP) as unknown,
          createdAt: expect.stringMatching(TIMESTAMP) as unknown,
          updatedAt: expect.stringMatching(TIMESTAMP) as unknown,
        },
        relationships: {
          roles: { data: [{ type: "roles", id: member?.id }] },
          avatar: { data: null },
        },
      },
      meta: { permissions: ["posts:create"] },
    });
  });

  it("include=roles면 가진 역할을 포함한다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const body = await me(app, user.accessToken, "?include=roles,roles");
    expect(body.included).toEqual([
      {
        type: "roles",
        id: findRoleByName(state.store, "member")?.id,
        attributes: {
          name: "member",
          description: "Given to everyone who signs up.",
          permissions: ["posts:create"],
          isSystem: true,
          createdAt: expect.stringMatching(TIMESTAMP) as unknown,
          updatedAt: expect.stringMatching(TIMESTAMP) as unknown,
        },
      },
    ]);
    expect(Object.keys(body)).toEqual(["data", "included", "meta"]);
    expect("included" in (await me(app, user.accessToken, "?include=avatar"))).toBe(false);
  });

  it("관리자는 등록된 모든 권한을 가지고, admin 역할의 권한도 그 전부다", async () => {
    const { app, config } = testApp();
    const admin = await signIn(app, config.seedAdmin.email, config.seedAdmin.password);
    const body = await me(app, admin.accessToken, "?include=roles");
    const every = PERMISSIONS.map((permission) => permission.code);
    expect(body.meta.permissions).toEqual(every);
    expect(
      body.included?.map((role) => [role.attributes.name, role.attributes.permissions]),
    ).toEqual([["admin", every]]);
    expect(body.data.attributes).toMatchObject({ name: "Admin", locale: "ko" });
  });

  it("fields[type]을 주면 그 타입의 리소스에 요청한 필드만 담는다", async () => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const query = "?include=roles&fields%5Busers%5D=name&fields%5Broles%5D=name";
    const body = await me(app, user.accessToken, query);
    expect(body.data.attributes).toEqual({ name: "가입자" });
    expect(body.data.relationships).toEqual({});
    expect(body.included?.[0]?.attributes).toEqual({ name: "member" });
    const empty = await me(app, user.accessToken, "?fields%5Busers%5D=");
    expect(empty.data.attributes).toEqual({});
    expect(empty.meta.permissions).toEqual(["posts:create"]);
  });

  it.each([
    ["?include=posts", "jsonapi.unsupported_include", "include"],
    ["?include=roles,,avatar", "jsonapi.invalid_query", "include"],
    ["?fields%5Bposts%5D=title", "jsonapi.invalid_query", "fields[posts]"],
    ["?sort=name", "jsonapi.invalid_query", "sort"],
    ["?include=roles&include=avatar", "jsonapi.invalid_query", "include"],
  ])("틀린 쿼리 %s는 400이다", async (query, code, parameter) => {
    const { app, state } = testApp();
    const user = await newUser(app, state);
    const response = await send(app, "GET", `${ME}${query}`, { token: user.accessToken });
    const errors = await errorsOf(response, 400);
    expect(errors.map((error) => [error.code, error.source])).toEqual([[code, { parameter }]]);
  });

  it("인증(401)이 쿼리 오류(400)보다 먼저다", async () => {
    const { app } = testApp();
    expect(await codesOf(await send(app, "GET", `${ME}?include=posts`), 401)).toEqual([
      "auth.unauthenticated",
    ]);
  });
});
