import { test, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { configureMobileCi } from "../src/mobile-ci.js";

interface Step {
  run?: string;
  env?: Record<string, string>;
}
interface Job {
  steps: Step[];
  env?: Record<string, string>;
}

test("compositions retain SDK validation and native jobs after child workflows are removed", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-mobile-ci-sdk-"));
  try {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    mkdirSync(join(root, "scripts"));
    writeFileSync(
      join(root, ".github/workflows/ci.yml"),
      "jobs:\n  check:\n    steps:\n      - run: pnpm check\n",
    );
    writeFileSync(join(root, "scripts/test-e2e.mjs"), "...frontendNames(root).map((app) => [\n");
    writeFileSync(
      join(root, "native-ci.json"),
      readFileSync(new URL("../assets/combo/mobile-only/native-ci.json", import.meta.url)),
    );
    configureMobileCi(root);
    const workflow = parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")) as {
      jobs: Record<string, Job>;
    };
    const health = workflow.jobs["mobile-check"];
    expect(health).toBeDefined();
    if (!health) throw new Error("Expected the composed mobile SDK check job.");
    expect(health.steps.some((step) => step.run === "pnpm install --frozen-lockfile")).toBe(true);
    expect(
      health.steps.some((step) => step.run === "pnpm --dir apps/mobile install --frozen-lockfile"),
    ).toBe(true);
    expect(
      health.steps.find((step) => step.run?.includes("expo install --check"))?.env?.EXPO_OFFLINE,
    ).toBe("1");
    expect(
      health.steps.find((step) => step.run?.includes("expo-doctor"))?.env
        ?.EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK,
    ).toBe("1");
    expect(health.env?.EXPO_PUBLIC_API_BASE_URL).toBe("https://api.example.com/api/v1");
    expect(workflow.jobs["mobile-android"]).toBeDefined();
    expect(workflow.jobs["mobile-ios"]).toBeDefined();
    expect(workflow.jobs.check?.env?.E2E_SKIP_MOBILE).toBe("1");
  } finally {
    expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
    expect(basename(root).startsWith("aitpl-mobile-ci-sdk-")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  }
});
