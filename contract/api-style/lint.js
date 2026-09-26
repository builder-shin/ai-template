// @ts-check
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, loadConfig } from "@redocly/openapi-core";
import { report } from "./report.js";

/** 사용법: node lint.js <OpenAPI 파일>. 위반마다 `파일#위치 [규칙] 메시지` 한 줄을 출력한다. */
const target = resolve(process.argv[2] ?? "../openapi.yaml");
const configPath = fileURLToPath(new URL("./redocly.yaml", import.meta.url));
const config = await loadConfig({ configPath });
report(target, await lint({ ref: target, config }));
