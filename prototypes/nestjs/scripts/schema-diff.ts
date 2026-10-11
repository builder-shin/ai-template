import "../src/modules/registry.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { comparable } from "../src/core/jsonapi/openapi/normalize.js";
import { emitSchemas } from "../src/core/jsonapi/openapi/emit.js";
import { isRecord } from "../src/core/jsonapi/errors.js";
export interface SchemaDifference {
  schema: string;
  pointer: string;
  expected: unknown;
  actual: unknown;
}
export function differences(
  expected: unknown,
  actual: unknown,
  schema: string,
  pointer = "",
): SchemaDifference[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  if (isRecord(expected) && isRecord(actual))
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) =>
      differences(expected[key], actual[key], schema, `${pointer}/${key}`),
    );
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length === actual.length)
    return expected.flatMap((v, i) => differences(v, actual[i], schema, `${pointer}/${String(i)}`));
  return [{ schema, pointer, expected, actual }];
}
export function schemaDiff(
  contract: Record<string, unknown>,
  implementation: Record<string, unknown>,
): SchemaDifference[] {
  return Object.entries(implementation).flatMap(([name, schema]) =>
    contract[name] === undefined
      ? [{ schema: name, pointer: "", expected: "declared contract component", actual: schema }]
      : differences(comparable(contract[name]), comparable(schema), name),
  );
}
export function readContract(): Record<string, unknown> {
  const repo = resolve(import.meta.dirname, "../../..");
  const yaml = createRequire(resolve(repo, "package.json"))("yaml") as {
    parse: (text: string) => { components: { schemas: Record<string, unknown> } };
  };
  return yaml.parse(readFileSync(resolve(repo, "contract/openapi.yaml"), "utf8")).components
    .schemas;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const input = process.argv[2];
  const implementation = input
    ? (
        JSON.parse(readFileSync(resolve(input), "utf8")) as {
          components: { schemas: Record<string, unknown> };
        }
      ).components.schemas
    : emitSchemas();
  const diff = schemaDiff(readContract(), implementation);
  console.log(
    JSON.stringify(
      { components: Object.keys(implementation).length, differences: diff.length, details: diff },
      null,
      2,
    ),
  );
  if (diff.length) process.exitCode = 1;
}
