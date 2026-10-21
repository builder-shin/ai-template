import { test } from "node:test";
import assert from "node:assert/strict";
import { stages } from "./stages.ts";

test("JS check has explicit gates and no native build or infrastructure", () => {
  assert.deepEqual(
    stages.map((s) => s.name),
    ["format", "lint", "types", "test", "node", "generated", "harness"],
  );
  assert.equal(
    stages.some((s) => /docker|prebuild|run:android|run:ios/.test(s.argv.join(" "))),
    false,
  );
});
