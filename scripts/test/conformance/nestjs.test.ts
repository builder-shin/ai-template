import { expect, it } from "vitest";
import { TARGETS, composeArgs, testEnv } from "../../src/conformance/targets.ts";

it("runs NestJS through its own app profile and public side channels", () => {
  const target = TARGETS.nestjs;
  if (target?.kind !== "compose") throw new Error("Missing NestJS compose target.");
  expect(composeArgs(target, "up")).toEqual([
    "compose",
    "-p",
    "nestjs",
    "-f",
    "prototypes/nestjs/compose.yaml",
    "--profile",
    "app",
    "up",
    "-d",
    "--build",
    "--wait",
  ]);
  expect(testEnv(target).CONFORMANCE_TARGET).toBe("nestjs");
  expect(target.baseUrl).toBe("http://localhost:8000");
  expect(target.env.CONFORMANCE_MAILPIT_URL).toBe("http://localhost:28025");
  expect(target.env.CONFORMANCE_ADMIN_EMAIL).toBe("compose-admin@example.com");
  expect(composeArgs(target, "down")).toEqual([
    "compose",
    "-p",
    "nestjs",
    "-f",
    "prototypes/nestjs/compose.yaml",
    "--profile",
    "app",
    "down",
  ]);
});
