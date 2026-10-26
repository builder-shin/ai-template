import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { relative, resolve, isAbsolute } from "node:path";
import { existsSync } from "node:fs";

test("app and copied contract tools resolve inside the independent native workspace", () => {
  const root = resolve(import.meta.dirname, "..");
  const require = createRequire(resolve(root, "package.json"));
  assert.ok(
    existsSync(resolve(root, "tsconfig.base.json")),
    "Copied contract packages need a local shared TypeScript configuration.",
  );
  assert.ok(
    existsSync(resolve(root, ".prettierrc.json")),
    "Standalone formatting must not inherit a parent repository configuration.",
  );
  for (const tool of ["typescript", "tsx", "openapi-typescript", "jest", "vitest"]) {
    const local = relative(resolve(root, "node_modules"), require.resolve(`${tool}/package.json`));
    assert.ok(
      !local.startsWith("..") && !isAbsolute(local),
      `${tool} must be declared inside the standalone app instead of using a parent repository.`,
    );
  }
});
