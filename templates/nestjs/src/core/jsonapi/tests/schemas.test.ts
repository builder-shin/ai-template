import { expect, it } from "vitest";
import { z } from "zod";
import {
  codePointString,
  jsonInteger,
  registerComponent,
  components,
  emailString,
  uuidString,
  dateTimeString,
} from "../schemas.js";
import { permissionCodeSchema } from "../../security/permissions.js";
import { errorCodeSchema } from "../error-codes.js";

it("문자열 길이는 코드 포인트로 센다", () => {
  const title = codePointString({ min: 2, max: 3 });
  expect(title.safeParse("😀😀😀").success).toBe(true);
  expect(title.safeParse("😀😀😀😀").success).toBe(false);
  expect(title.safeParse("😀").success).toBe(false);
  expect(z.toJSONSchema(title)).toMatchObject({ type: "string", minLength: 2, maxLength: 3 });
});
it("글 본문의 100000 코드 포인트 경계를 지킨다", () => {
  const body = codePointString({ max: 100000 });
  expect(body.safeParse("😀".repeat(100000)).success).toBe(true);
  expect(body.safeParse("😀".repeat(100001)).success).toBe(false);
});
it("제약 문자열의 짝 없는 서로게이트는 길이 오류보다 먼저 거절한다", () => {
  const result = codePointString({ min: 3 }).safeParse("\ud800");
  expect(result.success).toBe(false);
  if (!result.success) expect(result.error.issues).toMatchObject([{ code: "invalid_format" }]);
  expect(codePointString().safeParse("\ud800").success).toBe(true);
});
it("int64는 유한한 정수만 받고 안전 정수 상한을 더하지 않는다", () => {
  const size = jsonInteger({ min: 1, format: "int64" });
  for (const input of [
    JSON.parse("10.0") as unknown,
    JSON.parse("9007199254740993") as unknown,
    1e20,
  ])
    expect(size.safeParse(input).success).toBe(true);
  for (const input of [1.5, "10", false, 0, Infinity, NaN])
    expect(size.safeParse(input).success).toBe(false);
  const schema = z.toJSONSchema(size);
  expect(schema).toMatchObject({ type: "integer", format: "int64", minimum: 1 });
  expect(schema).not.toHaveProperty("maximum");
});
it("정수의 명시된 최대값만 검사한다", () => {
  const value = jsonInteger({ min: 0, max: 10, format: "int32" });
  expect(value.safeParse(10).success).toBe(true);
  expect(value.safeParse(11).success).toBe(false);
  expect(z.toJSONSchema(value)).toMatchObject({ format: "int32", maximum: 10 });
});
it.each([
  ["이메일", emailString, "a@example.com", "bad", "email"],
  ["UUID", uuidString, "019a096b-4980-7a52-bf1b-dcfb48964944", "bad", "uuid"],
  ["날짜시간", dateTimeString, "2026-09-27T00:00:00+09:00", "2026-09-27T00:00:00", "date-time"],
] as const)(
  "%s은 자체 형식을 검사하고 문서에 pattern을 더하지 않는다",
  (_name, make, good, bad, format) => {
    const schema = make();
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
    expect(z.toJSONSchema(schema)).toMatchObject({ type: "string", format });
    expect(z.toJSONSchema(schema)).not.toHaveProperty("pattern");
  },
);
it("레지스트리는 nullable과 판별자 선언을 보존하고 중복 이름을 거절한다", () => {
  const schema = z.discriminatedUnion("grantType", [
    z.object({ grantType: z.literal("password"), name: z.string().nullable() }),
    z.object({ grantType: z.literal("refreshToken") }),
  ]);
  const discriminator = {
    propertyName: "grantType",
    mapping: { password: "#/components/schemas/PasswordGrant" }, // 공개 컴포넌트 참조 fixture다. betterleaks:allow
  };
  expect(registerComponent("Task5Grant", schema, { discriminator })).toBe(schema);
  expect(components().get("Task5Grant")).toMatchObject({ schema, discriminator });
  expect(() => registerComponent("Task5Grant", z.string())).toThrow();
  expect(z.toJSONSchema(z.string().nullable())).toMatchObject({ type: ["string", "null"] });
});
it("권한과 오류 enum은 컴포넌트로 등록되고 실제 입력을 제한한다", () => {
  expect(permissionCodeSchema.safeParse("posts:manage").success).toBe(true);
  expect(permissionCodeSchema.safeParse("posts:read").success).toBe(false);
  expect(components().get("PermissionCode")?.schema).toBe(permissionCodeSchema);
  expect(components().get("ErrorCode")?.schema).toBe(errorCodeSchema);
  expect(errorCodeSchema.safeParse("validation.invalid_format").success).toBe(true);
});
