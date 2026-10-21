import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { generateFiles, writeGenerated, readGenerationConfig } from "./generate.ts";
import { pnpmCommand, run } from "./process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "aitpl-expo-gen-"));
try {
  const config = readGenerationConfig(root);
  const contract = resolve(root, config.contractRoot);
  run(
    pnpmCommand([
      "--dir",
      join(contract, "typespec"),
      "exec",
      "tsp",
      "compile",
      "src/main.tsp",
      "--option",
      `@typespec/openapi3.emitter-output-dir=${temporary}`,
    ]),
  );
  run(
    pnpmCommand([
      "exec",
      "openapi-typescript",
      join(temporary, "openapi.yaml"),
      "-o",
      join(temporary, "mock.ts"),
    ]),
  );
  const expected = await generateFiles(root, readFileSync(resolve(root, config.openapi), "utf8"));
  // The selected contract is owned once: locally or at the composition root.
  expected[relative(root, join(contract, "openapi.yaml")).replaceAll("\\", "/")] = readFileSync(
    join(temporary, "openapi.yaml"),
    "utf8",
  );
  expected[relative(root, join(contract, "mock/src/generated/api.ts")).replaceAll("\\", "/")] =
    readFileSync(join(temporary, "mock.ts"), "utf8");
  if (config.contractRoot === "contract") {
    Object.assign(expected, await generateFiles(root, expected["contract/openapi.yaml"]!));
  }
  writeGenerated(root, expected, process.argv.includes("--check"));
  console.log("API types current.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "API generation failed.");
  process.exitCode = 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
