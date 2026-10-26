import { expect, it } from "vitest";
import { parseArguments, usage } from "../src/arguments.ts";

it("accepts the fourteen backend/frontend combinations and standalone Expo", () => {
  for (const backend of ["fastapi", "nestjs"])
    for (let mask = 1; mask < 8; mask++) {
      const apps = ["web", "admin", "mobile"].filter((_, index) => mask & (1 << index));
      expect(
        parseArguments(["my-app", "--api", backend, ...apps.map((app) => `--${app}`)], {}),
      ).toMatchObject({ template: "combo", frontends: apps });
    }
  for (const name of ["mobile", "web", "api", "admin", "nestjs", "fastapi"]) {
    expect(parseArguments([name, "--template", "expo"], {})).toMatchObject({
      name,
      template: "expo",
    });
  }
  expect(usage).toContain("--mobile");
});
it.each([
  ["my-app", "--mobile"],
  ["my-app", "--api", "nestjs", "--mobile", "--mobile"],
  ["my-app", "--template", "expo", "--mobile"],
  ["mobile", "--api", "fastapi", "--web"],
  ["my-app", "--api", "nestjs", "--mobile", "--name", "mobile"],
])("rejects conflicting or reserved mobile input before creation: %j", (...args) => {
  expect(() => parseArguments(args, {})).toThrow(expect.objectContaining({ exitCode: 2 }));
});
