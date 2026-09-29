import { describe, expect, it } from "vitest";
import {
  auth,
  includedRefs,
  operation,
  parameterNames,
  refName,
  requestRef,
  resourceType,
  responseRef,
  schema,
  statuses,
} from "./spec.ts";

const COLLECTION = "/api/v1/posts";
const ITEM = "/api/v1/posts/{id}";

describe("골든 모듈 posts (§4.9)", () => {
  it("다섯 가지 operation을 모두 선언한다", () => {
    expect(responseRef(operation("get", COLLECTION), "200")).toBe("PostCollectionDocument");
    expect(responseRef(operation("post", COLLECTION), "201")).toBe("PostDocument");
    expect(responseRef(operation("get", ITEM), "200")).toBe("PostDocument");
    expect(responseRef(operation("patch", ITEM), "200")).toBe("PostDocument");
    expect(statuses(operation("delete", ITEM))).toContain("204");
  });

  it("목록은 페이지·정렬·포함·필드·필터 파라미터를 선언한다", () => {
    const list = operation("get", COLLECTION);
    expect(parameterNames(list)).toEqual([
      "page[number]",
      "page[size]",
      "sort",
      "include",
      "fields[posts]",
      "fields[users]",
      "fields[files]",
      "filter[status]",
      "filter[author]",
      "filter[q]",
    ]);
    expect(list["x-jsonapi-sort"]).toEqual(["createdAt", "publishedAt", "title"]);
    expect(list["x-jsonapi-include"]).toEqual(["author", "coverImage"]);
  });

  it("읽기는 비로그인도 되고, 쓰기는 로그인이 필요하다", () => {
    expect(auth(operation("get", COLLECTION))).toBe("optional");
    expect(auth(operation("get", ITEM))).toBe("optional");
    expect(auth(operation("post", COLLECTION))).toBe("required");
    expect(auth(operation("patch", ITEM))).toBe("required");
    expect(auth(operation("delete", ITEM))).toBe("required");
    expect(operation("post", COLLECTION)["x-permission"]).toBe("posts:create");
  });

  it("리소스는 type이 posts이고 작성자와 커버 이미지 관계를 가진다", () => {
    const resource = schema("PostResource");
    expect(resourceType(resource)).toBe("posts");
    expect(Object.keys(schema("PostRelationships").properties ?? {})).toEqual([
      "author",
      "coverImage",
    ]);
  });

  it("포함 리소스는 공개 사용자와 파일이다(이메일이 새지 않는다)", () => {
    expect(includedRefs(schema("PostDocument"))).toEqual(["FileResource", "UserPublicResource"]);
    expect(includedRefs(schema("PostCollectionDocument"))).toEqual([
      "FileResource",
      "UserPublicResource",
    ]);
  });

  it("본문(body)은 100,000자까지다(속성, 생성, 수정)", () => {
    for (const name of ["PostAttributes", "PostCreateAttributes", "PostUpdateAttributes"]) {
      expect(schema(name).properties?.body).toMatchObject({ maxLength: 100000 });
    }
  });

  it("생성·수정 문서를 쓰고 수정은 409와 422를 선언한다", () => {
    expect(requestRef(operation("post", COLLECTION))).toBe("PostCreateDocument");
    const update = operation("patch", ITEM);
    expect(requestRef(update)).toBe("PostUpdateDocument");
    expect(statuses(update)).toEqual(expect.arrayContaining(["409", "415", "422"]));
  });

  it("공통 에러(400, 406, 429, 500, 503)를 모든 operation에 선언한다", () => {
    for (const [method, path] of [
      ["get", COLLECTION],
      ["post", COLLECTION],
      ["get", ITEM],
      ["patch", ITEM],
      ["delete", ITEM],
    ] as const) {
      expect(statuses(operation(method, path))).toEqual(
        expect.arrayContaining(["400", "406", "429", "500", "503"]),
      );
    }
  });

  it("429 응답은 Retry-After 헤더를 담는다", () => {
    const tooMany = operation("get", COLLECTION).responses["429"];
    expect(Object.keys(tooMany?.headers ?? {})).toContain("Retry-After");
  });
});

describe("감사 로그 (§4.6)", () => {
  it("audit-logs:read 권한으로 목록과 단건을 읽는다", () => {
    const list = operation("get", "/api/v1/audit-logs");
    expect(list["x-permission"]).toBe("audit-logs:read");
    expect(resourceType(schema("AuditLogResource"))).toBe("audit-logs");
    expect(parameterNames(list)).toEqual(
      expect.arrayContaining([
        "filter[actor]",
        "filter[action]",
        "filter[targetType]",
        "filter[createdFrom]",
        "filter[createdTo]",
      ]),
    );
    expect(operation("get", "/api/v1/audit-logs/{id}")["x-permission"]).toBe("audit-logs:read");
  });

  it("포함 리소스는 공개 사용자다(users:read가 없어도 이메일이 새지 않는다)", () => {
    expect(includedRefs(schema("AuditLogDocument"))).toEqual(["UserPublicResource"]);
    expect(includedRefs(schema("AuditLogCollectionDocument"))).toEqual(["UserPublicResource"]);
  });

  it("행위와 대상 종류는 계약의 enum이다(FastAPI 설계 F21)", () => {
    expect(schema("AuditLogAction").enum).toEqual([
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
    expect(schema("AuditLogTargetType").enum).toEqual(["users", "roles", "posts"]);
    const attributes = schema("AuditLogAttributes").properties;
    expect(refName(attributes?.action)).toBe("AuditLogAction");
    expect(
      attributes?.targetType?.anyOf?.map((variant) => refName(variant) ?? variant.type),
    ).toEqual(["AuditLogTargetType", "null"]);
    const list = operation("get", "/api/v1/audit-logs");
    const parameter = (name: string) => list.parameters?.find((item) => item.name === name);
    expect(refName(parameter("filter[action]")?.schema)).toBe("AuditLogAction");
    expect(refName(parameter("filter[targetType]")?.schema)).toBe("AuditLogTargetType");
  });
});
