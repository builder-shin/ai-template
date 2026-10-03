import openapiTS, { astToString } from "openapi-typescript";
import { parse } from "yaml";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, win32 } from "node:path";

const header = "// 직접 수정 금지 — pnpm gen으로 생성한다.\n";

interface Contract {
  components: { schemas: Record<string, unknown> & { ErrorCode: { enum: string[] } } };
  "x-realtime-events": { name: string; payload: string }[];
}

export function generateMetadata(spec: Contract): Record<string, string> {
  const events = spec["x-realtime-events"];
  for (const event of events) {
    if (!Object.hasOwn(spec.components.schemas, event.payload))
      throw new Error(`실시간 payload ${event.payload}를 계약 schemas에 정의한다.`);
  }
  return {
    "src/lib/generated/error-codes.ts":
      header +
      `export const errorCodes = ${JSON.stringify(spec.components.schemas.ErrorCode.enum, null, 2)} as const;\nexport type ErrorCode = (typeof errorCodes)[number];\n`,
    "src/lib/generated/realtime.ts":
      header +
      'import type { components } from "../api/schema";\n\n' +
      `export const realtimeEventNames = ${JSON.stringify(
        events.map((event) => event.name),
        null,
        2,
      )} as const;\n` +
      "export interface RealtimeEventPayloads {\n" +
      events
        .map(
          (event) =>
            `  ${JSON.stringify(event.name)}: components["schemas"][${JSON.stringify(event.payload)}];`,
        )
        .join("\n") +
      "\n}\nexport type RealtimeEventName = keyof RealtimeEventPayloads;\n",
  };
}

export async function generateWeb(openapi: string): Promise<Record<string, string>> {
  return {
    "src/lib/api/schema.d.ts": header + astToString(await openapiTS(openapi)),
    ...generateMetadata(parse(openapi) as Contract),
  };
}

export function readWebOpenapi(root: string, contractOpenapi: string): string {
  const configPath = join(root, "gen.config.json");
  if (!existsSync(configPath)) return contractOpenapi;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("gen.config.json을 읽을 수 없다 — 올바른 JSON 파일로 저장한다.");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).length !== 1 ||
    !("openapi" in config) ||
    typeof config.openapi !== "string" ||
    !config.openapi.trim() ||
    isAbsolute(config.openapi) ||
    win32.isAbsolute(config.openapi)
  )
    throw new Error(
      "gen.config.json 설정이 잘못됐다 — openapi 하나에 web 루트 기준 상대 경로 문자열을 넣는다.",
    );
  const specPath = join(root, config.openapi);
  const stat = statSync(specPath, { throwIfNoEntry: false });
  if (!stat)
    throw new Error(`${config.openapi} 스펙 파일이 없다 — 백엔드에서 gen을 먼저 실행한다.`);
  if (!stat.isFile())
    throw new Error(`${config.openapi} 스펙이 일반 파일이 아니다 — OpenAPI 파일을 지정한다.`);
  return readFileSync(specPath, "utf8").replace(/^\uFEFF/, "");
}

export async function generateFiles(
  root: string,
  contractOpenapi: string,
  mockTypes: string,
): Promise<Record<string, string>> {
  return {
    "contract/openapi.yaml": contractOpenapi,
    "contract/mock/src/generated/api.ts": mockTypes,
    ...(await generateWeb(readWebOpenapi(root, contractOpenapi))),
  };
}

export function staleFiles(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  return Object.keys(expected).filter((path) => expected[path] !== actual[path]);
}
