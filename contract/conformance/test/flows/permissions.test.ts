import { describe, expect, it } from "vitest";
import { codes, newUser, signInAdmin, target } from "./support.ts";

/** 계약의 PermissionCode 목록(코드 순). */
const CODES = [
  "admin:access",
  "audit-logs:read",
  "posts:create",
  "posts:manage",
  "roles:manage",
  "roles:read",
  "users:manage",
  "users:read",
];

describe(`권한 (${target.name})`, () => {
  it("등록된 권한을 코드 순으로 보고, 역순으로도 정렬한다", async () => {
    const manager = await signInAdmin();
    const { data, response } = await manager.api.GET("/api/v1/permissions", {
      params: { query: { "page[size]": 100 } },
    });
    expect(response.status).toBe(200);
    expect(data?.data.map((permission) => permission.id)).toEqual(CODES);
    for (const permission of data?.data ?? []) {
      expect(permission.attributes.description).not.toBe("");
      expect(permission.id.startsWith(`${permission.attributes.group}:`)).toBe(true);
    }
    const reversed = await manager.api.GET("/api/v1/permissions", {
      params: { query: { sort: "-id", "page[size]": 100 } },
    });
    expect(reversed.data?.data.map((permission) => permission.id)).toEqual([...CODES].reverse());
  });

  it("roles:read가 없으면 권한 목록을 보지 못한다", async () => {
    const user = await newUser();
    const { error, response } = await user.api.GET("/api/v1/permissions");
    expect(response.status).toBe(403);
    expect(codes(error)).toEqual(["permission.denied"]);
  });
});
