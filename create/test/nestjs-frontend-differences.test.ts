import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { frontendDifferences, type NativeRunner } from "./nestjs-probe-ci-support.mjs";
import { temporaryFolder, write } from "./helpers.ts";

type App = "web" | "admin";
const contractPath = "contract/mock/src/generated/api.ts";
const appPath = "src/generated/api.ts";
const root = resolve(import.meta.dirname, "../..");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const sourceContract = (app: App) => `// ${app} 계약 원본\n`;
const sourceApp = (app: App) => `// ${app} 앱 원본\n`;
const sharedContract = "// 조합의 공유 계약 결과\n";

function fixture(frontends: readonly App[]) {
  const clone = temporaryFolder(),
    target = temporaryFolder(),
    evidence = temporaryFolder(),
    api = join(target, "apps/api");
  write(clone, "contract/openapi.yaml", readFileSync(join(root, "contract/openapi.yaml"), "utf8"));
  write(api, "openapi.json", readFileSync(join(root, "prototypes/nestjs/openapi.json"), "utf8"));
  write(target, contractPath, sharedContract);
  for (const app of frontends) {
    const template = app === "web" ? "nextjs" : "nextjs-admin";
    write(clone, `templates/${template}/${contractPath}`, sourceContract(app));
    write(clone, `templates/${template}/${appPath}`, sourceApp(app));
    write(
      target,
      `apps/${app}/${appPath}`,
      app === "web" ? sourceApp(app) : "// admin 생성 결과\n",
    );
  }
  // 순수 추적 목록 대역이다. stdout만 제공하며 네이티브 Git 실행·측정 증거를 만들지 않는다.
  const trackedList = vi.fn<NativeRunner>((label, command, args, options) => {
    const app = frontends.find((name) => label === `fixture-${name}-generated-source`);
    expect(app).toBeDefined();
    const template = app === "web" ? "nextjs" : "nextjs-admin";
    expect(command).toBe("git");
    expect(args).toEqual(["ls-files", "-z", "--", `templates/${template}`]);
    expect(options).toEqual({ cwd: clone });
    return {
      stdout: [contractPath, appPath, "README.md"]
        .map((path) => `templates/${template}/${path}\0`)
        .join(""),
    } as ReturnType<NativeRunner>;
  });
  const observe = () => {
    frontendDifferences(clone, target, api, frontends, trackedList, evidence, "fixture");
  };
  return { target, evidence, trackedList, observe };
}

it.each([
  { frontends: ["web"] },
  { frontends: ["admin"] },
  { frontends: ["web", "admin"] },
] as const)(
  "공유 계약은 조합 루트, 앱 생성물은 각 앱에서 전부 관찰한다: $frontends",
  ({ frontends }) => {
    const { evidence, trackedList, observe } = fixture(frontends);
    observe();
    const result = JSON.parse(
      readFileSync(join(evidence, "frontend-gen-differences.json"), "utf8"),
    ) as {
      generatedFrontendDifferences: unknown[];
    };
    expect(trackedList).toHaveBeenCalledTimes(frontends.length);
    expect(result.generatedFrontendDifferences).toEqual(
      frontends.flatMap((app) => {
        const generatedApp = app === "web" ? sourceApp(app) : "// admin 생성 결과\n";
        return [
          {
            app,
            path: contractPath,
            generatedPath: contractPath,
            original: sourceContract(app),
            generated: sharedContract,
          },
          {
            app,
            path: appPath,
            generatedPath: `apps/${app}/${appPath}`,
            original: sourceApp(app),
            generated: generatedApp,
          },
        ].map(({ original, generated, ...row }) => ({
          ...row,
          originalBytes: Buffer.byteLength(original),
          generatedBytes: Buffer.byteLength(generated),
          originalSHA256: sha(original),
          generatedSHA256: sha(generated),
          changed: original !== generated,
        }));
      }),
    );
  },
);

it.each(["web", "admin"] as const)(
  "루트 계약이 없으면 이전 apps/%s/contract 사본이 있어도 실패한다",
  (app) => {
    const { target, observe } = fixture([app]);
    rmSync(join(target, contractPath));
    write(target, `apps/${app}/${contractPath}`, sharedContract);
    expect(observe).toThrow(`Missing frontend generated file: ${join(target, contractPath)}`);
  },
);

it.each(["web", "admin"] as const)(
  "%s 앱 생성물이 없으면 루트와 다른 앱의 사본이 있어도 실패한다",
  (app) => {
    const { target, observe } = fixture([app]);
    rmSync(join(target, "apps", app, appPath));
    write(target, appPath, sourceApp(app));
    write(target, `apps/${app === "web" ? "admin" : "web"}/${appPath}`, sourceApp(app));
    expect(observe).toThrow(
      `Missing frontend generated file: ${join(target, "apps", app, appPath)}`,
    );
  },
);
