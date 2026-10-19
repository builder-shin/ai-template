import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { createProject } from "../src/create.ts";
import { verifyAppResolutions } from "../src/lockfile.ts";
import { nestjsFixture, sourceText } from "./nestjs-fixture.ts";
import { temporaryFolder, write } from "./helpers.ts";
import { dependency } from "./lock-fixture.ts";

function generated() {
  const repository = nestjsFixture();
  const target = join(temporaryFolder(), "aitpl-isolated-api");
  const calls: { cwd: string; args: string[] }[] = [];
  createProject(
    {
      target,
      name: "isolated-api",
      template: "combo",
      backend: "nestjs",
      frontends: ["web", "admin"],
      git: false,
    },
    repository,
    {
      pnpm: (cwd, args) => {
        calls.push({ cwd, args });
      },
    },
  );
  return { repository, target, calls };
}
it("R124 생성은 실제 API 잠금·workspace 원문과 실행 권한을 독립 설치 경계에 보존한다", () => {
  const { repository, target } = generated();
  for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) {
    expect(existsSync(join(target, "apps/api", file))).toBe(true);
    expect(sourceText(target, `apps/api/${file}`)).toBe(
      sourceText(repository, `templates/nestjs/${file}`),
    );
    expect(statSync(join(target, "apps/api", file)).mode & 0o111).toBe(
      statSync(join(repository, "templates/nestjs", file)).mode & 0o111,
    );
  }
  verifyAppResolutions(
    ["web", "admin"].map((app) => ({
      app,
      source: sourceText(
        repository,
        `templates/${app === "web" ? "nextjs" : "nextjs-admin"}/pnpm-lock.yaml`,
      ),
    })),
    sourceText(target, "pnpm-lock.yaml"),
    { typescriptPin: "6.0.3" },
  );
});
it("R124 루트 그래프는 API 실제 의존성 대신 의존성 없는 api 작업 proxy만 포함한다", () => {
  const { target } = generated();
  expect(
    (parse(sourceText(target, "pnpm-workspace.yaml")) as { packages: string[] }).packages,
  ).toEqual(["tools/api", "apps/web", "apps/admin", "contract/*"]);
  const lock = dependency(sourceText(target, "pnpm-lock.yaml"));
  expect(Object.keys(lock.importers)).not.toContain("apps/api");
  expect(lock.importers["tools/api"]).toEqual({});
  expect(existsSync(join(target, "tools/api/package.json"))).toBe(true);
  const proxy = JSON.parse(sourceText(target, "tools/api/package.json")) as Record<string, unknown>;
  expect(proxy.name).toBe("api");
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"])
    expect(proxy[key]).toBeUndefined();
});
it("R124 생성은 루트와 실제 API frozen 설치 뒤에만 web·admin gen을 실행한다", () => {
  const { target, calls } = generated();
  const installs = calls.filter(({ args }) => args.includes("install"));
  expect(
    installs.map(({ cwd, args }) => ({ api: cwd.endsWith(join(sep, "apps", "api")), args })),
  ).toEqual([
    { api: false, args: ["install", "--lockfile-only"] },
    { api: false, args: ["install", "--frozen-lockfile"] },
    { api: true, args: ["install", "--frozen-lockfile"] },
  ]);
  const apiInstall = calls.findIndex(
    ({ cwd, args }) => cwd.endsWith(join(sep, "apps", "api")) && args.includes("--frozen-lockfile"),
  );
  expect(apiInstall).toBeGreaterThan(0);
  const gens = calls
    .map(({ args }, index) => ({ args, index }))
    .filter(({ args }) => args.includes("gen"));
  expect(gens.map(({ args }) => args)).toEqual([
    ["--filter", "web", "run", "gen"],
    ["--filter", "admin", "run", "gen"],
  ]);
  expect(gens.every(({ index }) => index > apiInstall)).toBe(true);
  expect(existsSync(join(target, "apps/api/pnpm-lock.yaml"))).toBe(true);
});
it("R124 Turbo는 실제 API 입력과 비캐시 작업을 선언하고 기존 gen 의존성을 유지한다", () => {
  const { target } = generated();
  const turbo = JSON.parse(sourceText(target, "turbo.json")) as {
    tasks: Record<
      string,
      { inputs?: string[]; cache?: boolean; persistent?: boolean; dependsOn?: string[] }
    >;
  };
  for (const task of ["check", "test", "dev", "gen", "fix", "build"]) {
    expect(turbo.tasks[`api#${task}`]).toMatchObject({
      cache: false,
      inputs: ["$TURBO_DEFAULT$", "$TURBO_ROOT$/apps/api/**"],
    });
  }
  expect(turbo.tasks["api#dev"]?.persistent).toBe(true);
  for (const app of ["web", "admin"]) {
    expect(turbo.tasks[`${app}#gen`]?.dependsOn).toEqual(["api#gen"]);
    expect(turbo.tasks[`${app}#gen`]?.inputs).toContain("$TURBO_ROOT$/apps/api/openapi.json");
    expect(sourceText(target, `apps/${app}/Dockerfile`)).toContain(
      "COPY tools/api/package.json ./tools/api/package.json",
    );
    expect(sourceText(target, `apps/${app}/Dockerfile`)).not.toContain(
      "COPY apps/api/package.json",
    );
  }
});
it("R124 API 이미지는 자체 잠금으로 설치하고 R1은 실제 API 의존성을 갱신한다", () => {
  const { target } = generated();
  const docker = sourceText(target, "apps/api/Dockerfile");
  expect(docker).toContain(
    "COPY apps/api/package.json apps/api/pnpm-lock.yaml apps/api/pnpm-workspace.yaml ./",
  );
  expect(docker).toContain("WORKDIR /app/apps/api");
  expect(docker).toContain("RUN pnpm install --frozen-lockfile --prod");
  expect(docker).toContain("USER 10001:10001");
  expect(docker).not.toContain("--filter api");
  const ci = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/ci.yml"), "utf8");
  expect(ci).toContain("pnpm --dir apps/api remove nodemailer");
  expect(ci).toContain("pnpm --dir apps/api add -E nodemailer@10.1.0");
  expect(ci).toContain("if (report.shadowed.length) throw new Error");
});

it.each(["root-frozen", "api-frozen"])(
  "R124 %s 설치가 실제 API 잠금 원문을 바꾸면 생성과 후속 gen을 중단한다",
  (phase) => {
    const repository = nestjsFixture(),
      target = join(temporaryFolder(), "aitpl-mutated-api");
    const calls: string[][] = [];
    expect(() =>
      createProject(
        {
          target,
          name: "mutated-api",
          template: "combo",
          backend: "nestjs",
          frontends: ["web"],
          git: false,
        },
        repository,
        {
          pnpm: (cwd, args) => {
            calls.push(args);
            if (
              args.includes("--frozen-lockfile") &&
              cwd.endsWith(join(sep, "apps", "api")) === (phase === "api-frozen")
            ) {
              const folder = phase === "api-frozen" ? cwd : join(cwd, "apps/api");
              write(folder, "pnpm-lock.yaml", sourceText(folder, "pnpm-lock.yaml") + "# changed\n");
            }
          },
        },
      ),
    ).toThrow(/api: pnpm-lock.yaml 원문/);
    expect(calls.some((args) => args.includes("gen"))).toBe(false);
    expect(existsSync(target)).toBe(false);
  },
);
it("R124 생성 fixture는 b25 사본 대신 현재 작업 자산 바이트를 입력 커밋에 고정한다", () => {
  const { repository, target } = generated();
  for (const [source, generatedPath] of [
    ["nestjs-only/tools/api/package.json", "tools/api/package.json"],
    ["nestjs-only/scripts/api-command.mjs", "scripts/api-command.mjs"],
    ["apps/api/Dockerfile.nestjs", "apps/api/Dockerfile"],
  ]) {
    if (!source || !generatedPath) throw new Error("자산 경로가 없다");
    const current = readFileSync(resolve(import.meta.dirname, "../assets/combo", source), "utf8");
    expect(sourceText(repository, `create/assets/combo/${source}`)).toBe(current);
    expect(sourceText(target, generatedPath)).toBe(current);
  }
});

it("실제 잠금의 socket.io 그림자는 API 공유 importer 우선순위에서 생기며 분리한 그래프는 4.8.4를 유지한다", () => {
  const original = (template: string) =>
    dependency(
      readFileSync(
        resolve(import.meta.dirname, `../../templates/${template}/pnpm-lock.yaml`),
        "utf8",
      ),
    );
  const api = original("nestjs").importers["."];
  const frontend = original("nextjs").importers["contract/mock"];
  if (!api || !frontend) throw new Error("원본 importer가 없다");
  const select = (importers: Record<string, typeof api>) => {
    for (const key of Object.keys(importers).sort()) {
      const dependencies = importers[key]?.dependencies as
        Record<string, { version: string }> | undefined;
      if (dependencies?.["socket.io"]) return dependencies["socket.io"].version;
    }
    throw new Error("socket.io 직접 별칭이 없다");
  };
  expect(select({ "apps/api": api, "contract/mock": frontend })).toBe(
    "4.8.3(supports-color@7.2.0)",
  );
  expect(select({ "tools/api": {}, "contract/mock": frontend })).toBe(
    "4.8.4(supports-color@7.2.0)",
  );
});
