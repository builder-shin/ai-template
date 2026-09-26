import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lintFromString, loadConfig } from "@redocly/openapi-core";
import { parse, stringify } from "yaml";
import { isRecord } from "../rules/util.js";

export type Json = Record<string, unknown>;

const configPath = fileURLToPath(new URL("../redocly.yaml", import.meta.url));
const fixturePath = fileURLToPath(new URL("./fixtures/valid.yaml", import.meta.url));

/** 매번 새로 읽어서 테스트끼리 변경이 섞이지 않게 한다. */
export function validFixture(): Json {
  return parse(readFileSync(fixturePath, "utf8")) as Json;
}

/** 경로를 따라 내려가 객체를 돌려준다. 픽스처의 한 곳을 고칠 때 쓴다. */
export function at(node: Json, ...keys: string[]): Json {
  let current: unknown = node;
  for (const key of keys) {
    current = isRecord(current) ? current[key] : undefined;
  }
  if (!isRecord(current)) throw new Error(`${keys.join(" > ")}가 객체가 아니다`);
  return current;
}

/** operation의 파라미터 중 이름이 `name`인 것을 뺀다. */
export function removeParameter(operation: Json, name: string): void {
  const parameters = Array.isArray(operation.parameters) ? (operation.parameters as unknown[]) : [];
  operation.parameters = parameters.filter(
    (parameter) => isRecord(parameter) && parameter.name !== name,
  );
}

/** 룰셋으로 문서를 검사해 발생한 규칙 id를 중복 없이 정렬해 돌려준다. */
export async function ruleIds(doc: Json): Promise<string[]> {
  const config = await loadConfig({ configPath });
  const problems = await lintFromString({
    source: stringify(doc),
    absoluteRef: fixturePath,
    config,
  });
  return [...new Set(problems.map((problem) => problem.ruleId))].sort();
}
