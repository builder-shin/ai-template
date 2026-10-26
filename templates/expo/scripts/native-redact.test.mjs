import { test } from "node:test";
import assert from "node:assert/strict";
import { redactNative } from "./native/redact.mjs";
test("runtime native diagnostics never expose URLs, codes, tokens, passwords or verifier values", () => {
  const password = "native-fixture-password"; // betterleaks:allow
  const result = redactNative(
    `failure ${password}\nopen aitpl-example://oauth/callback?code=one-use\nPUT https://storage.example/object?signature=private\n{"refreshToken":"opaque-refresh","verifier":"pending-pkce"}\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature-value`, // betterleaks:allow deliberately invalid JWT for redaction test
    [password],
  );
  for (const value of [
    password,
    "one-use",
    "signature=private",
    "opaque-refresh",
    "pending-pkce",
    "eyJhbGciOiJIUzI1NiJ9",
  ])
    assert.equal(result.includes(value), false);
  assert.match(result, /failure/);
});
test("opaque bearer credentials and terminal styling are also removed", () => {
  const credential = "opaque-test-access";
  const result = redactNative(
    `${String.fromCharCode(27)}[31mAuthorization: Bearer ${credential}${String.fromCharCode(27)}[0m`,
  );
  assert.equal(result.includes(credential), false);
  assert.equal(result.includes(String.fromCharCode(27)), false);
});
