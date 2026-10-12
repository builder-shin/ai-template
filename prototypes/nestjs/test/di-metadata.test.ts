import { expect, it } from "vitest";
import { runFivePaths } from "../scripts/di-probe.js";

it("compares five real transformations and verifies resolved provider identities", () => {
  const results = runFivePaths();
  for (const name of ["tsc", "swc", "vitest-swc", "vitest-oxc"]) {
    expect(results[name]?.graph).toEqual({ compiled: true, verified: true, error: null });
    expect(results[name]?.metadata.Consumer).toEqual(["Dependency", "PublicDependency"]);
    expect(results[name]?.misuse.rejected).toBe(true);
  }
  for (const name of ["tsx"]) {
    expect(results[name]?.metadata.Consumer).toBeNull();
    expect(results[name]?.graph.verified).toBe(false);
    expect(results[name]?.misuse.rejected).toBe(true);
  }
}, 60000);
