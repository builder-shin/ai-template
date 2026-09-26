// @ts-check
import { resolve } from "node:path";
import { createConfig, lint } from "@redocly/openapi-core";
import jsonApiPlugin from "./plugin.js";
import { report } from "./report.js";

/**
 * 템플릿에 사본으로 넣는 한 파일짜리 룰셋(dist/lint.mjs)의 입구. build.js가 esbuild로 묶는다.
 * 규칙 설정은 빌드할 때 redocly.yaml의 rules가 API_STYLE_RULES로 들어가므로 실행할 때 파일을 읽지 않는다.
 * 사용법: node lint.mjs <OpenAPI 파일(YAML 또는 JSON)>
 */
/**
 * 규칙 함수는 문서 전체를 느슨한 Json 타입으로 받는다(util.js의 defineRule).
 * Redocly의 Plugin 타입은 OAS 버전별 정확한 노드 타입을 기대해 구조가 겹치지 않으므로 unknown을 거쳐 바꾼다.
 * lint()는 문자열이 아닌 plugins 항목을 파일로 읽지 않고 이 객체를 그대로 실행한다.
 */
const plugin = /** @type {import("@redocly/openapi-core").Plugin} */ (
  /** @type {unknown} */ (jsonApiPlugin())
);
const config = await createConfig({ plugins: [plugin], rules: API_STYLE_RULES });
const target = resolve(process.argv[2] ?? "openapi.json");
report(target, await lint({ ref: target, config }));
