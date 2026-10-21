import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configureMobileCi } from "./mobile-ci.ts";

export function configureMobileApp(root: string): void {
  const app = join(root, "apps/mobile"),
    path = join(app, "package.json"),
    pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  pkg.name = "mobile";
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  writeFileSync(
    join(app, "mobile-defaults.json"),
    JSON.stringify(
      {
        mode: "backend",
        android: { apiBaseUrl: "http://10.0.2.2:8000/api/v1", realtimeUrl: "http://10.0.2.2:8000" },
        ios: { apiBaseUrl: "http://localhost:8000/api/v1", realtimeUrl: "http://localhost:8000" },
      },
      null,
      2,
    ) + "\n",
  );
  const identity = JSON.parse(readFileSync(join(app, "app-identity.json"), "utf8")) as {
    scheme: string;
  };
  const env = join(root, "apps/api/.env.example");
  const source = readFileSync(env, "utf8");
  const pattern = /^(OAUTH_REDIRECT_URIS=)([^\r\n]*)/m;
  if (pattern.test(source))
    writeFileSync(
      env,
      source.replace(
        pattern,
        (_line, key: string, values: string) =>
          `${key}${values},${identity.scheme}://oauth/callback`,
      ),
    );
  else
    writeFileSync(
      env,
      source +
        `\n# Explicit native callback allowlist; retain existing web callbacks when configuring deployment.\nOAUTH_REDIRECT_URIS=${identity.scheme}://oauth/callback\n`,
    );
  // Native WebSockets send their API origin, independently of the selected web frontends.
  const example = readFileSync(env, "utf8");
  const origins = ["http://10.0.2.2:8000", "http://localhost:8000"];
  const realtime = /^(REALTIME_ALLOWED_ORIGINS=)([^\r\n]*)/m;
  writeFileSync(
    env,
    realtime.test(example)
      ? example.replace(
          realtime,
          (_line, key: string, values: string) =>
            key + [...new Set([...values.split(",").filter(Boolean), ...origins])].join(","),
        )
      : example +
          `\n# Exact native development WebSocket origins; configure deployment explicitly.\nREALTIME_ALLOWED_ORIGINS=${origins.join(",")}\n`,
  );
}
export function configureMobileDocs(root: string, apps: readonly string[]): void {
  configureMobileCi(root);
  const runner = join(root, "scripts/frontend-e2e.mjs");
  let text = readFileSync(runner, "utf8");
  text = 'import { mobileEnvironment, mobileE2e } from "./mobile-e2e.mjs";\n' + text;
  text = text.replace(
    "  for (const key of [",
    '  if (app === "mobile") return mobileEnvironment(source);\n  for (const key of [',
  );
  text = text.replace(
    "export function frontendE2e(root, app, source = process.env, execute = run) {",
    'export function frontendE2e(root, app, source = process.env, execute = run) {\n  if (app === "mobile") return mobileE2e(root, source, execute);',
  );
  writeFileSync(runner, text);
  const names = join(root, "scripts/apps.mjs");
  writeFileSync(
    names,
    readFileSync(names, "utf8").replace(
      "export function e2eOrigin(root, app) {",
      'export function e2eOrigin(root, app) {\n  if (app === "mobile") return "http://localhost:3112";',
    ),
  );
  for (const name of ["AGENTS.md", "README.md"]) {
    const path = join(root, name);
    let source = readFileSync(path, "utf8");
    source = source.replaceAll(
      "Next.js BFF",
      apps.some((app) => app !== "mobile") ? "Next.js BFF·Expo" : "Expo",
    );
    source = source.replace(
      /\| apps\/mobile\/ \|[^\n]*/g,
      "| apps/mobile/ | iOS·Android Expo, API 직접 연결, 독립 pnpm 경계 |",
    );
    source += `\n## Mobile workspace\n\n모바일은 \`apps/mobile\`의 잠금·workspace로 독립 설치한다. 루트 \`tools/mobile\`은 의존성 없는 작업 proxy이며 \`pnpm --filter mobile run check\` 등을 전달한다. add/remove/exec는 \`pnpm --dir apps/mobile\`을 사용한다. 루트 계약 패키지는 루트에만 설치하고 모바일 gen·목 테스트도 그 경로를 사용한다. gen/check/native 작업은 캐시하지 않는다.\n\n\`apps/mobile/mobile-defaults.json\`은 추적되는 공개 개발 기본값이다(Android 10.0.2.2:8000, iOS localhost:8000, backend 모드). 실제 기기는 명시한 EXPO_PUBLIC_* 주소를 사용한다. release는 명시한 HTTPS 주소만 허용한다. OAuth의 생성된 private callback을 API allowlist에 유지하고, presigned 스토리지 host는 서명 전에 기기에서 닿도록 설정한다. .env를 읽거나 출력하지 않는다.\n\n모바일에는 웹 Dockerfile·healthcheck가 없다. \`pnpm --filter mobile run build -- --platform android\`와 실제 기기를 지정하는 \`test:e2e\`를 사용한다. Metro 8081/8082, 단독 목 4012/4112를 소유권 확인 후 사용한다. 웹 BFF·Playwright·프론트 컨테이너 설명은 ${apps.filter((app) => app !== "mobile").join("·") || "선택되지 않은 웹 앱"}에만 해당한다.\n`;
    source += [
      "\n### Native aggregate E2E\n",
      "루트 `pnpm test:e2e`는 API·선택한 웹 시험 뒤 모바일을 실행한다. 모바일 단계는 웹 전용 `e2e:serve`를 재사용하지 않으며, 미리 준비한 전용 backend와 실제 기기를 명시해야 한다.",
      "`E2E_MOBILE_PLATFORM=android|ios`, `E2E_MOBILE_DEVICE=<기기 ID>`, `E2E_MOBILE_BACKEND=fastapi|nestjs`, `E2E_MOBILE_API_URL=<호스트의 API Origin>`, `E2E_MOBILE_STORAGE_URL=<호스트의 S3 Origin>`, `E2E_WEB_URL`, `E2E_MAILPIT_URL`, `E2E_OAUTH_URL`을 설정한다. 선택한 `E2E_MOBILE_RUN_ID`는 이전 산출물이 없는 새 ID여야 한다.",
      "API·S3 upstream은 명시한 loopback 주소다. 실행기는 API 4112·스토리지 4116 proxy와 Metro 8082·bridge 4113을 소유하며, API는 `API_URL=http://127.0.0.1:4112`, `S3_PUBLIC_ENDPOINT_URL=http://127.0.0.1:4116`, 앱 scheme의 정확한 OAuth callback allowlist와 WebSocket Origin을 사용해야 한다. 제공자 authorize는 `http://127.0.0.1:4112/_native/oauth/<provider>/authorize`를 사용한다. 기존 포트·기기 앱·ADB reverse를 덮어쓰지 않는다.",
      "기기 없는 CI aggregate의 `E2E_SKIP_MOBILE=1`은 모바일 성공 증거가 아니다. 별도 native CI와 저장소의 실제 backend 조합 시험을 구분한다.\n",
    ].join("\n\n");
    writeFileSync(path, source);
  }
}
