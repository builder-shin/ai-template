import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSharedAssets } from "../../src/sync/sync.ts";
import type { SharedAssetsManifest } from "../../src/verify-templates/manifest.ts";

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** 원본 두 개, web·api 템플릿, 템플릿 밖의 파일을 가진 임시 저장소. web의 계약 사본은 낡았다. */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "sync-"));
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
  write(repo, "contract/api-style/lint.js", "// 룰셋\n");
  write(repo, "templates/web/template.json", "{}");
  write(repo, "templates/web/openapi.yaml", "openapi: 3.0.0\n");
  write(repo, "templates/api/template.json", "{}");
  write(repo, "scripts/shared-assets.json", '{ "assets": [] }');
  return repo;
}

/** 원본 하나를 사본 위치 하나로 복사하는 manifest. */
function manifest(source: string, template: string, path: string): SharedAssetsManifest {
  return { assets: [{ source, targets: [{ template, path }] }] };
}

const read = (repo: string, path: string) => readFileSync(join(repo, path), "utf8");

describe("syncSharedAssets", () => {
  it("규칙을 지킨 항목은 파일이든 폴더든 사본 위치로 복사한다", () => {
    const repo = makeRepo();
    const copied = syncSharedAssets(repo, {
      assets: [
        { source: "contract/openapi.yaml", targets: [{ template: "web", path: "openapi.yaml" }] },
        { source: "contract/api-style", targets: [{ template: "api", path: "api-style" }] },
      ],
    });
    expect(copied).toEqual([
      "contract/openapi.yaml → templates/web/openapi.yaml",
      "contract/api-style → templates/api/api-style",
    ]);
    expect(read(repo, "templates/web/openapi.yaml")).toBe("openapi: 3.1.0\n");
    expect(read(repo, "templates/api/api-style/lint.js")).toBe("// 룰셋\n");
  });

  it('사본 위치가 빈 경로("")면 거부하고 템플릿을 지우지 않는다', () => {
    const repo = makeRepo();
    expect(() => syncSharedAssets(repo, manifest("contract", "web", ""))).toThrow(
      /assets\[0\]\.targets\[0\]\.path/,
    );
    expect(existsSync(join(repo, "templates/web/template.json"))).toBe(true);
  });

  it("..로 템플릿 밖을 가리키면 거부하고, 앞의 올바른 항목까지 아무것도 지우지 않는다", () => {
    const repo = makeRepo();
    const escapes: SharedAssetsManifest = {
      assets: [
        { source: "contract/openapi.yaml", targets: [{ template: "web", path: "openapi.yaml" }] },
        {
          source: "contract",
          targets: [
            { template: "web", path: "../api" },
            { template: "..", path: "scripts" },
          ],
        },
      ],
    };
    expect(() => syncSharedAssets(repo, escapes)).toThrow(
      /assets\[1\]\.targets\[0\]\.path[\s\S]*assets\[1\]\.targets\[1\]\.template/,
    );
    expect(existsSync(join(repo, "templates/api/template.json"))).toBe(true);
    expect(existsSync(join(repo, "scripts/shared-assets.json"))).toBe(true);
    expect(read(repo, "templates/web/openapi.yaml")).toBe("openapi: 3.0.0\n");
  });

  it("원본이 없으면(오타) 사본을 지우지 않는다", () => {
    const repo = makeRepo();
    const typo = manifest("contract/opneapi.yaml", "web", "openapi.yaml");
    expect(() => syncSharedAssets(repo, typo)).toThrow(/assets\[0\]\.source/);
    expect(read(repo, "templates/web/openapi.yaml")).toBe("openapi: 3.0.0\n");
  });
});
