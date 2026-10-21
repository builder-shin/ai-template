import { signupSchema, passwordSchema, emailSchema } from "./schemas";
import { ApiError } from "../../lib/api/errors";
import { errorKey, fieldError } from "../../lib/forms/errors";

test("registration follows the contract and retains safe fields on validation", () => {
  expect(signupSchema.safeParse({ email: "bad", name: "", password: "short" }).success).toBe(false); // betterleaks:allow test password
  expect(
    signupSchema.parse({ email: "test@example.com", name: "Test", password: "valid-password" }), // betterleaks:allow test password
  ).toEqual({ email: "test@example.com", name: "Test", password: "valid-password" }); // betterleaks:allow test password
  expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  expect(emailSchema.parse(" test@example.com ")).toBe("test@example.com");
});
test.each([
  [401, "auth.invalid_credentials", "invalidCredentials"],
  [403, "auth.email_not_verified", "emailNotVerified"],
  [409, "resource.conflict", "conflict"],
  [422, "auth.verification_token_invalid", "invalidLink"],
  [429, "rate_limit.exceeded", "rateLimited"],
  [403, "auth.reauthentication_required", "recentLoginRequired"],
] as const)("typed remote error %s/%s is localized at render time", (status, code, key) => {
  expect(errorKey(new ApiError(status, [{ code }]))).toBe(key);
});
test("only known top-level field pointers are mapped", () => {
  const error = new ApiError(422, [
    { code: "validation.already_taken", source: { pointer: "/data/attributes/email" } },
  ]);
  expect(fieldError(error, "email")).toBe("alreadyTaken");
  expect(fieldError(error, "name")).toBeUndefined();
  expect(errorKey(new TypeError("private server detail"))).toBe("offline");
});
test("untrusted API errors never become typed codes or unsafe fields", async () => {
  const error = await ApiError.fromResponse(
    new Response(
      JSON.stringify({
        errors: [
          null,
          { code: { private: true } },
          { code: "unknown", source: { pointer: "/data/attributes/__proto__" } },
        ],
      }),
      { status: 422 },
    ),
  );
  expect(error.errors).toEqual([]);
  expect(error.fieldErrors()).toEqual({});
});
test("password length uses Unicode code points, matching the contract", () => {
  expect(passwordSchema.safeParse("🙂".repeat(7)).success).toBe(false);
  expect(passwordSchema.safeParse("🙂".repeat(100)).success).toBe(true);
});
