import { expect, it } from "vitest";
import { z } from "zod";
import { defineOperation } from "../operation.js";
import { validateRequest } from "../validation.js";
import { codePointString } from "../schemas.js";
import { errorsOf } from "./helpers.js";
const principal = { userId: "owner", sessionId: "session", permissions: new Set<never>() };
const base = {
  method: "PATCH",
  path: "/api/v1/current-members",
  tags: ["members"],
  summary: "현재 회원을 고친다",
  auth: "required",
  body: z.object({
    data: z.object({
      type: z.enum(["members"]),
      id: z.string(),
      attributes: z.object({ name: codePointString({ min: 1 }) }),
    }),
  }),
  responses: { 200: { description: "성공했다" } },
  errors: [],
} as const;
const owned = defineOperation({
  ...base,
  operationId: "Task16PrincipalBodyId",
  bodyIdSource: "principal",
});
const path = defineOperation({
  ...base,
  operationId: "Task16DefaultPathBodyId",
  path: "/api/v1/members/{id}",
});
it("선택한 별칭은 principal id 충돌과 필드 오류를 함께 400으로 모은다", () => {
  const error = errorsOf(() =>
    validateRequest(owned, {
      search: "",
      params: {},
      principal,
      body: { data: { type: "members", id: "other", attributes: { name: "" } } },
    }),
  );
  expect(error.status).toBe(400);
  expect(error.errors.map((e) => e.init)).toMatchObject([
    { status: 409, code: "resource.conflict", source: { pointer: "/data/id" } },
    { status: 422, code: "validation.too_short", source: { pointer: "/data/attributes/name" } },
  ]);
});
it("principal id를 선택하면 다른 경로 id가 있어도 본인 id로 비교한다", () => {
  expect(
    validateRequest(owned, {
      search: "",
      params: { id: "other" },
      principal,
      body: { data: { type: "members", id: "owner", attributes: { name: "회원" } } },
    }).body.data.id,
  ).toBe("owner");
});
it("선택하지 않은 기존 PATCH는 principal 대신 경로 id를 유지한다", () => {
  expect(
    validateRequest(path, {
      search: "",
      params: { id: "path" },
      principal,
      body: { data: { type: "members", id: "path", attributes: { name: "회원" } } },
    }).body.data.id,
  ).toBe("path");
});
