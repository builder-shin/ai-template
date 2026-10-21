import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeLinkFromMail } from "./mail-link.ts";
import { readPublicEnv } from "../src/lib/config/env.ts";
const env = readPublicEnv({}, "ios", false);

test("mail adapter only translates an exact frontend link of the requested kind", () => {
  assert.equal(
    nativeLinkFromMail(
      "Visit http://localhost:3000/en/verify-email?token=fixture-token",
      "verify-email",
      env,
    ),
    `${env.scheme}://verify-email?token=fixture-token`,
  );
  assert.equal(
    nativeLinkFromMail("Visit https://attacker.example/verify-email?token=x", "verify-email", env),
    null,
  );
  assert.equal(
    nativeLinkFromMail(
      "Visit http://localhost:3000/verify-email?token=x&role=admin",
      "verify-email",
      env,
    ),
    null,
  );
  assert.equal(
    nativeLinkFromMail("Visit http://localhost:3000/reset-password?token=x", "verify-email", env),
    null,
  );
});
