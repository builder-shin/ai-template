import { mkdirSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stringify } from "yaml";
import { verifyBackendDependencies } from "../../src/verify-templates/dependencies.ts";

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});
function fixture(values: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "aitpl-backend-dependencies-"));
  repos.push(root);
  for (const name of ["nestjs", "nextjs", "nextjs-admin"]) {
    const dir = join(root, "templates", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify(values[name] ?? {}));
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      stringify(
        values[`${name}Workspace`] ?? {
          minimumReleaseAge: 1440,
          overrides: { typescript: "6.0.3" },
          allowBuilds: {},
        },
      ),
    );
  }
  return root;
}
it("공통 직접 의존성 버전이 다르면 알린다", () => {
  expect(
    verifyBackendDependencies(
      fixture({
        nestjs: { devDependencies: { typescript: "6.0.3" } },
        nextjs: { devDependencies: { typescript: "6.0.2" } },
      }),
    ),
  ).toContain(
    'typescript: nestjs devDependencies="6.0.3", nextjs devDependencies="6.0.2" — 백엔드와 프론트의 공통 의존성을 같은 버전으로 고치고 잠금 파일을 갱신한다.',
  );
});
it("의존성 구역이 달라도 admin과 같은 패키지를 비교한다", () => {
  expect(
    verifyBackendDependencies(
      fixture({
        nestjs: { dependencies: { zod: "4.6.5" } },
        "nextjs-admin": { devDependencies: { zod: "4.6.6" } },
      }),
    ),
  ).toEqual([
    'zod: nestjs dependencies="4.6.5", nextjs-admin devDependencies="4.6.6" — 백엔드와 프론트의 공통 의존성을 같은 버전으로 고치고 잠금 파일을 갱신한다.',
  ]);
});
it.each(["nestjs", "nextjs", "nextjs-admin"])(
  "workspace %s가 없으면 정책 비교만 생략하고 패키지 버전을 비교한다",
  (name) => {
    const root = fixture({
      nestjs: { dependencies: { zod: "4.6.5" } },
      "nextjs-admin": { devDependencies: { zod: "4.6.6" } },
      nextjsWorkspace: {
        minimumReleaseAge: 0,
        overrides: { typescript: "6.0.4" },
        allowBuilds: {},
      },
    });
    expect(verifyBackendDependencies(root)).toHaveLength(3);
    unlinkSync(join(root, "templates", name, "pnpm-workspace.yaml"));
    expect(verifyBackendDependencies(root)).toEqual([
      'zod: nestjs dependencies="4.6.5", nextjs-admin devDependencies="4.6.6" — 백엔드와 프론트의 공통 의존성을 같은 버전으로 고치고 잠금 파일을 갱신한다.',
    ]);
  },
);
it("같은 직접 버전과 세 workspace의 TS override는 통과한다", () => {
  const pkg = { devDependencies: { typescript: "6.0.3" } };
  expect(
    verifyBackendDependencies(fixture({ nestjs: pkg, nextjs: pkg, "nextjs-admin": pkg })),
  ).toEqual([]);
});
it("allowBuilds는 합집합을 허용하고 같은 키의 충돌만 알린다", () => {
  expect(
    verifyBackendDependencies(
      fixture({
        nestjsWorkspace: {
          minimumReleaseAge: 1440,
          overrides: { typescript: "6.0.3" },
          allowBuilds: { argon2: true, esbuild: true },
        },
        nextjsWorkspace: {
          minimumReleaseAge: 1440,
          overrides: { typescript: "6.0.3" },
          allowBuilds: { esbuild: false },
        },
      }),
    ),
  ).toEqual(["allowBuilds.esbuild: nestjs=true, nextjs=false — 같은 키의 빌드 허용 값을 맞춘다"]);
});
it("서로 다른 빌드 허용 키와 앱 전용 의존성은 허용한다", () => {
  expect(
    verifyBackendDependencies(
      fixture({
        nestjs: { dependencies: { argon2: "0.45.1" } },
        nextjs: { dependencies: { next: "16.3.8" } },
        nestjsWorkspace: {
          minimumReleaseAge: 1440,
          overrides: { typescript: "6.0.3" },
          allowBuilds: { argon2: true },
        },
        nextjsWorkspace: {
          minimumReleaseAge: 1440,
          overrides: { typescript: "6.0.3" },
          allowBuilds: { sharp: true },
        },
      }),
    ),
  ).toEqual([]);
});
it.each(["minimumReleaseAge", "overrides"])("workspace의 %s 차이를 알린다", (key) => {
  const root = fixture({
    nextjsWorkspace: {
      minimumReleaseAge: key === "minimumReleaseAge" ? 0 : 1440,
      overrides: { typescript: key === "overrides" ? "6.0.4" : "6.0.3" },
      allowBuilds: {},
    },
  });
  expect(verifyBackendDependencies(root)).toHaveLength(1);
  expect(verifyBackendDependencies(root)[0]).toContain(key);
});
it("override의 없음과 선언도 다르다", () => {
  expect(
    verifyBackendDependencies(
      fixture({
        nextjsWorkspace: { minimumReleaseAge: 1440, allowBuilds: {} },
      }),
    ),
  ).toHaveLength(1);
});
it.each(["nestjs", "nextjs", "nextjs-admin"])("패키지 %s가 없으면 초기 등록을 허용한다", (name) => {
  const root = fixture();
  unlinkSync(join(root, "templates", name, "package.json"));
  expect(verifyBackendDependencies(root)).toEqual([]);
});
