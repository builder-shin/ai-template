import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CreateError } from "./errors.ts";
import type { ComboFrontend } from "./combo.ts";
export function comboVariables(
  name: string,
  frontends: readonly ComboFrontend[],
  first: ComboFrontend,
  frontend: string,
) {
  const pkg = JSON.parse(readFileSync(join(frontend, "package.json"), "utf8")) as {
    engines?: { node?: string };
    devDependencies?: Record<string, string>;
  };
  const required = (value: string | undefined, key: string): string => {
    if (typeof value !== "string" || !value.trim())
      throw new CreateError(
        `${first.name} package.json에 ${key} 값이 없다`,
        `${first.name} package.json의 엔진·도구 버전을 채우고 커밋한다.`,
      );
    return value;
  };
  const typescript = required(pkg.devDependencies?.typescript, "devDependencies.typescript");
  const hasWeb = frontends.some(({ name: app }) => app === "web");
  const hasAdmin = frontends.some(({ name: app }) => app === "admin");
  const variables: Record<string, string> = {
    NAME: name,
    NODE: required(pkg.engines?.node, "engines.node"),
    LEFTHOOK: required(pkg.devDependencies?.lefthook, "devDependencies.lefthook"),
    PRETTIER: required(pkg.devDependencies?.prettier, "devDependencies.prettier"),
    NODE_TYPES: required(pkg.devDependencies?.["@types/node"], "devDependencies.@types/node"),
    VITEST: required(pkg.devDependencies?.vitest, "devDependencies.vitest"),
    YAML: required(pkg.devDependencies?.yaml, "devDependencies.yaml"),
    FRONTEND_ROWS: frontends
      .map(({ name: app }) =>
        app === "mobile"
          ? "| apps/mobile/ | iOS·Android Expo, API 직접 연결, 독립 pnpm 경계 |"
          : `| apps/${app}/ | Next.js ${app} BFF, 화면·HTTP 통합·E2E |`,
      )
      .join("\n"),
    FRONTEND_GUIDES: frontends
      .map(({ name: app }) => `[${app} 지침](apps/${app}/AGENTS.md)`)
      .join("·"),
    FRONTEND_PATHS: frontends.map(({ name: app }) => `\`apps/${app}/\``).join(", "),
    FRONTEND_URLS: frontends
      .map(
        ({ name: app }) =>
          `${app} http://localhost:${app === "mobile" ? "8081 (Metro)" : app === "admin" ? "3001" : "3000"}`,
      )
      .join(", "),
    FRONTEND_E2E_PORTS: frontends
      .map(
        ({ name: app }) =>
          `${app} ${app === "mobile" ? "8082 (Metro)" : app === "admin" ? "3101" : "3100"}`,
      )
      .join(", "),
    FRONTEND_APP_ORIGINS: frontends
      .map(
        ({ name: app }) => `${app} 예: \`http://127.0.0.1:${app === "admin" ? "3201" : "3200"}\``,
      )
      .join(", "),
    FRONTEND_CHECK_NOTES: hasWeb
      ? " web check는 gen-feature 테스트의 설치 때문에 패키지 레지스트리 접속이 필요하다."
      : "",
    FRONTEND_E2E_FLOW: [
      `gen은 api 뒤에 각 프론트를 차례로 실행한다. E2E는 api 뒤에 ${frontends
        .map(({ name: app }) => app)
        .sort()
        .join(", ")} 순서로 실행하며 첫 실패에서 멈춘다.`,
      ...(frontends.length > 1
        ? [
            frontends.some((app) => app.name === "mobile")
              ? "모든 프론트는 같은 루트 계약 생성물을 같은 바이트로 만든다."
              : "두 프론트는 같은 루트 계약 생성물을 같은 바이트로 만든다.",
          ]
        : []),
      ...(hasAdmin ? ["admin은 E2E_SEED_ADMIN_EMAIL·E2E_SEED_ADMIN_PASSWORD를 요구한다."] : []),
      ...(hasWeb ? ["web은 E2E_OAUTH_URL을 요구한다."] : []),
    ].join(" "),
    FRONTEND_HEALTHCHECK: hasAdmin
      ? "admin은 로그인 화면으로 이동한다. healthcheck는 이동을 따라가며 200 또는 303을 받아들인다."
      : "",
    FRONTEND_PORT_ROWS: frontends
      .map(
        ({ name: app }) =>
          `| ${app} dev·목, E2E·목 | ${app === "mobile" ? "8081·4012, 8082·4112" : app === "admin" ? "3001·4011, 3101·4111" : "3000·4010, 3100·4110"} |`,
      )
      .join("\n"),
    FRONTEND_IMAGES: frontends
      .filter(({ name: app }) => app !== "mobile")
      .map(({ name: app }) => {
        const port = app === "admin" ? "3001" : "3000";
        const host = app === "admin" ? "3201" : "3200";
        return `\`\`\`sh\nDOCKER_BUILDKIT=1 docker build -f apps/${app}/Dockerfile . --tag ${name}-${app}\ndocker run --rm --publish 127.0.0.1:${host}:${port} \\\n  --env API_BASE_URL --env APP_URL --env NEXT_PUBLIC_REALTIME_URL \\\n  --env TIME_ZONE --env SESSION_SECRET ${name}-${app}\n\`\`\``;
      })
      .join("\n\n"),
  };
  return { typescript, variables };
}
