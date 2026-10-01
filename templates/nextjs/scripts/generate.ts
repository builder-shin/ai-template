import openapiTS, { astToString } from "openapi-typescript";
import { parse } from "yaml";

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

export function staleFiles(
  expected: Record<string, string>,
  actual: Record<string, string>,
): string[] {
  return Object.keys(expected).filter((path) => expected[path] !== actual[path]);
}
