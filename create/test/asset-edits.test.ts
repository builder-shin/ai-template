import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { applyAssetEdits } from "../src/asset-edits.ts";
import { selectFrontendSteps } from "../src/frontend-config.ts";
import { temporaryFolder, write } from "./helpers.ts";

interface SetupModule {
  setup: (
    root: string,
    options: {
      frontends: string[];
      nodeVersion: string;
      output: () => void;
      run: (command: string) => { status: number; stdout: string };
    },
  ) => number;
}
interface FrontendModule {
  frontendE2e: (
    root: string,
    app: string,
    source: Record<string, string>,
    execute: (
      command: string,
      args: string[],
      options: { env: Record<string, string> },
    ) => { status: number },
  ) => number;
}

const assets = resolve(import.meta.dirname, "../assets/combo");
const workflow = ".github/workflows/ci.yml";
const original = () =>
  selectFrontendSteps(readFileSync(join(assets, workflow), "utf8"), ["web", "admin"]);
it("FastAPI 자산은 원문 바이트를 유지하고 NestJS는 선택 뒤 API 이미지와 도구를 바꾼다", () => {
  const source = original();
  expect(applyAssetEdits(workflow, source, "fastapi")).toBe(source);
  const changed = applyAssetEdits(workflow, source, "nestjs");
  expect(changed).not.toContain("astral-sh/setup-uv");
  expect(changed).toContain("docker build -f apps/api/Dockerfile .");
  expect(changed).toContain("docker build -f apps/admin/Dockerfile .");
});
it.each(["missing", "duplicate"])(
  "NestJS 편집 기준이 유일하지 않으면 경로를 포함해 실패한다: %s",
  (kind) => {
    const source =
      kind === "missing"
        ? original().replace("docker build apps/api", "docker build different")
        : original() + original();
    expect(() => applyAssetEdits(workflow, source, "nestjs")).toThrow(
      "자산 편집 기준이 바뀌었다: .github/workflows/ci.yml",
    );
    expect(applyAssetEdits(workflow, source, "fastapi")).toBe(source);
  },
);
it.each(["nestjs", "fastapi"])(
  "생성된 실행기는 실제 API 파일로 uv 필요 여부와 프론트 E2E 대상을 정한다: %s",
  async (backend) => {
    const root = temporaryFolder();
    for (const name of ["process.mjs", "apps.mjs", "setup.mjs", "frontend-e2e.mjs"])
      write(
        root,
        `scripts/${name}`,
        applyAssetEdits(
          `scripts/${name}`,
          readFileSync(join(assets, "scripts", name), "utf8"),
          "nestjs",
        ),
      );
    write(root, "apps/api/package.json", '{"name":"api"}\n');
    if (backend === "fastapi") write(root, "apps/api/pyproject.toml", "[project]\n");
    const { setup } = (await import(
      pathToFileURL(join(root, "scripts/setup.mjs")).href
    )) as SetupModule;
    const tools: string[] = [];
    expect(
      setup(root, {
        frontends: ["web"],
        nodeVersion: "24.19.0",
        output: () => undefined,
        run: (command: string) => {
          tools.push(command);
          return { status: 0, stdout: "true\n" };
        },
      }),
    ).toBe(0);
    expect(tools.includes("uv")).toBe(backend === "fastapi");
    const { frontendE2e } = (await import(
      pathToFileURL(join(root, "scripts/frontend-e2e.mjs")).href
    )) as FrontendModule;
    const source = {
      E2E_API_URL: "http://localhost:18000",
      E2E_WEB_URL: "http://localhost:3100",
      E2E_MAILPIT_URL: "http://localhost:28025",
      E2E_OAUTH_URL: "http://localhost:28080",
      E2E_RECENT_LOGIN_SECONDS: "10",
    };
    const environments: Record<string, string>[] = [];
    expect(
      frontendE2e(
        root,
        "web",
        source,
        (_command: string, _args: string[], options: { env: Record<string, string> }) => {
          environments.push(options.env);
          return { status: 7 };
        },
      ),
    ).toBe(7);
    expect(environments[0]).toMatchObject({
      E2E_TARGET: backend,
      API_BASE_URL: "http://localhost:18000/api/v1",
      APP_URL: "http://localhost:3100",
    });
  },
);
