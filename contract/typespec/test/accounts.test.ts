import { describe, expect, it } from "vitest";
import {
  auth,
  includedRefs,
  operation,
  parameterNames,
  requestRef,
  resourceType,
  responseRef,
  schema,
  spec,
  statuses,
} from "./spec.ts";

describe("사용자 (§4.10, §5.6)", () => {
  it("전체 속성과 공개 속성을 나눠 둔다", () => {
    expect(resourceType(schema("UserResource"))).toBe("users");
    expect(resourceType(schema("UserPublicResource"))).toBe("users");
    expect(Object.keys(schema("UserPublicAttributes").properties ?? {})).toEqual(["name"]);
    expect(schema("UserAttributes").required).toEqual([
      "email",
      "name",
      "locale",
      "status",
      "emailVerifiedAt",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("공개 사용자의 관계는 아바타 하나뿐이다", () => {
    expect(Object.keys(schema("UserPublicRelationships").properties ?? {})).toEqual(["avatar"]);
  });

  it("GET /me는 로그인이 필요하고 meta.permissions를 담는다", () => {
    const me = operation("get", "/api/v1/me");
    expect(auth(me)).toBe("required");
    expect(responseRef(me, "200")).toBe("UserMeDocument");
    const meta = schema("UserMeDocument").properties?.meta;
    expect(meta?.required).toEqual(["permissions"]);
  });

  it("PATCH /me와 DELETE /me(탈퇴)가 있다", () => {
    expect(requestRef(operation("patch", "/api/v1/me"))).toBe("UserMeUpdateDocument");
    expect(statuses(operation("delete", "/api/v1/me"))).toContain("204");
  });

  it("관리용 목록은 users:read 권한과 필터를 선언한다", () => {
    const list = operation("get", "/api/v1/users");
    expect(list["x-permission"]).toBe("users:read");
    expect(parameterNames(list)).toEqual(
      expect.arrayContaining(["filter[q]", "filter[status]", "filter[role]", "fields[users]"]),
    );
    expect(responseRef(list, "200")).toBe("UserCollectionDocument");
    expect(includedRefs(schema("UserCollectionDocument"))).toEqual([
      "FileResource",
      "RoleResource",
    ]);
  });

  it("상태와 역할 변경은 users:manage 권한이 필요하다", () => {
    const update = operation("patch", "/api/v1/users/{id}");
    expect(update["x-permission"]).toBe("users:manage");
    expect(requestRef(update)).toBe("UserUpdateDocument");
    expect(statuses(update)).toEqual(expect.arrayContaining(["200", "404", "409", "415", "422"]));
  });
});

describe("역할과 권한 (§4.3)", () => {
  it("권한 코드 목록이 스펙과 같다", () => {
    expect(schema("PermissionCode").enum).toEqual([
      "admin:access",
      "users:read",
      "users:manage",
      "roles:read",
      "roles:manage",
      "audit-logs:read",
      "posts:create",
      "posts:manage",
    ]);
  });

  it("역할 CRUD 권한을 나눠 선언한다", () => {
    expect(operation("get", "/api/v1/roles")["x-permission"]).toBe("roles:read");
    expect(operation("post", "/api/v1/roles")["x-permission"]).toBe("roles:manage");
    expect(operation("delete", "/api/v1/roles/{id}")["x-permission"]).toBe("roles:manage");
    expect(statuses(operation("delete", "/api/v1/roles/{id}"))).toContain("422");
  });

  it("권한 목록은 id가 권한 코드인 읽기 전용 컬렉션이다", () => {
    const list = operation("get", "/api/v1/permissions");
    expect(responseRef(list, "200")).toBe("PermissionCollectionDocument");
    expect(Object.keys(spec.paths["/api/v1/permissions"] ?? {})).toEqual(["get"]);
  });
});

describe("파일 (§4.4)", () => {
  it("생성하면 meta.upload에 presigned URL을 담는다", () => {
    const create = operation("post", "/api/v1/files");
    expect(requestRef(create)).toBe("FileCreateDocument");
    expect(responseRef(create, "201")).toBe("FileDocument");
    expect(Object.keys(schema("FileMeta").properties ?? {})).toEqual([
      "upload",
      "downloadUrl",
      "downloadUrlExpiresAt",
    ]);
  });

  it("조회는 비로그인도 시도할 수 있다(읽기 규칙은 백엔드가 판정)", () => {
    expect(auth(operation("get", "/api/v1/files/{id}"))).toBe("optional");
  });

  it("업로드 완료 확인은 PATCH로 status를 ready로 바꾼다", () => {
    const update = operation("patch", "/api/v1/files/{id}");
    expect(requestRef(update)).toBe("FileUpdateDocument");
  });
});
