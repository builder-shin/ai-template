import { expect, it } from "vitest";
import { isUniqueViolation } from "../errors.js";
it("Prisma 고유 오류와 필드 배열을 판별한다", () => {
  const error = { code: "P2002", meta: { target: ["email"] } };
  expect(isUniqueViolation(error)).toBe(true);
  expect(isUniqueViolation(error, "email")).toBe(true);
  expect(isUniqueViolation(error, "name")).toBe(false);
});
it("Prisma 7 pg 어댑터의 고유 오류 index를 판별한다", () => {
  const error = {
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          originalCode: "23505",
          constraint: { index: "users_email_key" },
        },
      },
    },
  };
  expect(isUniqueViolation(error, "email")).toBe(true);
  expect(isUniqueViolation(error, "mail")).toBe(false);
});
it("Prisma 7 pg 어댑터의 필드 제약을 판별한다", () => {
  const error = {
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: {
          kind: "UniqueConstraintViolation",
          constraint: { fields: ["name"] },
        },
      },
    },
  };
  expect(isUniqueViolation(error, "name")).toBe(true);
});
it.each([null, new Error("연결 실패"), { code: "P2025" }, { code: "23505" }])(
  "다른 오류를 고유 위반으로 바꾸지 않는다: %j",
  (error) => {
    expect(isUniqueViolation(error)).toBe(false);
  },
);
