import openapiTS, { astToString } from "openapi-typescript";
import { parse } from "yaml";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";

interface Spec {
  openapi: string;
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> & { ErrorCode: { enum: string[] } } };
  "x-realtime-events": { name: string; payload: string }[];
}
const header = "// 직접 수정 금지 — pnpm gen으로 생성한다.\n";

export function readGenerationConfig(root: string): { openapi: string; contractRoot: string } {
  const path = join(root, "gen.config.json");
  if (!existsSync(path))
    throw new Error("gen.config.json: provide the selected relative OpenAPI path.");
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    openapi?: unknown;
    contractRoot?: unknown;
  };
  if (
    typeof config.openapi !== "string" ||
    isAbsolute(config.openapi) ||
    config.openapi.includes("://")
  )
    throw new Error("gen.config.json: openapi must be a relative file path.");
  const contractRoot = config.contractRoot ?? "contract";
  if (contractRoot !== "contract" && contractRoot !== "../../contract")
    throw new Error(
      "gen.config.json: contractRoot must identify the standalone or composition contract.",
    );
  return { openapi: config.openapi, contractRoot };
}

export async function generateFiles(
  _root: string,
  openapi: string,
): Promise<Record<string, string>> {
  const spec = parse(openapi) as Spec;
  if (
    !spec?.openapi ||
    !spec.paths ||
    !Array.isArray(spec.components?.schemas?.ErrorCode?.enum) ||
    !Array.isArray(spec["x-realtime-events"])
  )
    throw new Error("OpenAPI requires paths, ErrorCode and realtime schemas.");
  for (const event of spec["x-realtime-events"]) {
    if (!Object.hasOwn(spec.components.schemas, event.payload))
      throw new Error("Realtime payload schema missing.");
  }
  spec.paths = Object.fromEntries(
    Object.entries(spec.paths).map(([path, operation]) => [
      path.replace(/^\/api\/v1(?=\/|$)/, ""),
      operation,
    ]),
  );
  return {
    "src/lib/api/generated/schema.d.ts":
      header + astToString(await openapiTS(JSON.stringify(spec))),
    "src/lib/api/generated/error-codes.ts":
      header +
      `export const errorCodes = ${JSON.stringify(spec.components.schemas.ErrorCode.enum)} as const;\nexport type ErrorCode = (typeof errorCodes)[number];\n`,
    "src/lib/api/generated/realtime.ts":
      header +
      'import type { components } from "./schema";\n' +
      `export const realtimeEventNames = ${JSON.stringify(spec["x-realtime-events"].map((e) => e.name))} as const;\n` +
      "export interface RealtimeEventPayloads {\n" +
      spec["x-realtime-events"]
        .map(
          (e) =>
            `  ${JSON.stringify(e.name)}: components["schemas"][${JSON.stringify(e.payload)}];`,
        )
        .join("\n") +
      "\n}\n",
  };
}

export function writeGenerated(
  root: string,
  expected: Record<string, string>,
  check: boolean,
): void {
  if (check) {
    const stale = Object.entries(expected).filter(
      ([path, value]) =>
        !existsSync(join(root, path)) || readFileSync(join(root, path), "utf8") !== value,
    );
    if (stale.length)
      throw new Error(
        `${stale.map(([path]) => `${path}:1`).join("\n")} stale generated files — run pnpm gen.`,
      );
  } else
    for (const [path, value] of Object.entries(expected)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), value);
    }
}
