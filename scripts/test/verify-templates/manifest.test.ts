import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSharedAssets } from "../../src/verify-templates/manifest.ts";

const repos: string[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { recursive: true, force: true });
});

const TEMPLATE_RULE =
  'templates/ 바로 아래 폴더 이름 하나를 적는다. 빈 값, ".", "..", 그리고 "/", "\\", ":" 같은 구분자는 안 된다.';
const SOURCE_RULE = "저장소 안이면서 templates/ 밖인 상대 경로를 적는다.";
const pathRule = (template: string) =>
  `templates/${template}/ 안쪽의 상대 경로를 적는다. 빈 값, ".", 절대 경로, 템플릿 밖으로 나가는 경로는 안 된다.`;

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** 원본 contract/openapi.yaml이 있는 임시 저장소에 shared-assets.json을 쓰고 읽는다. */
function read(manifest: unknown) {
  const repo = mkdtempSync(join(tmpdir(), "aitpl-shared-assets-"));
  repos.push(repo);
  write(repo, "contract/openapi.yaml", "openapi: 3.1.0\n");
  write(repo, "scripts/shared-assets.json", JSON.stringify(manifest));
  return readSharedAssets(repo);
}

describe("readSharedAssets", () => {
  it("규칙을 지킨 manifest를 그대로 돌려준다", () => {
    const manifest = {
      assets: [
        { source: "contract/openapi.yaml", targets: [{ template: "web", path: "openapi.yaml" }] },
      ],
    };
    expect(read(manifest)).toEqual(manifest);
    expect(read({ assets: [] })).toEqual({ assets: [] });
  });

  it("형식이 틀리면 어느 항목인지 알려 준다", () => {
    expect(read([])).toEqual(['{ "assets": [...] } 꼴의 객체여야 한다.']);
    const assets = [
      "contract",
      { source: "contract", targets: {} },
      { source: "contract", targets: [null] },
    ];
    expect(read({ assets })).toEqual([
      'assets[0]: { "source", "targets" } 꼴의 객체여야 한다.',
      "assets[1].targets: 배열이어야 한다.",
      'assets[2].targets[0]: { "template", "path" } 꼴의 객체여야 한다.',
    ]);
  });

  it("사본 위치가 templates/<template>/ 안쪽이 아니면 거부한다", () => {
    const targets = [
      { template: "web", path: "" },
      { template: "web", path: "." },
      { template: "web", path: "../api/openapi.yaml" },
      { template: "web", path: "docs/../.." },
      { template: "web", path: resolve("/outside.yaml") },
      { template: "web", path: 1 },
      { template: "..", path: "scripts" },
      { template: "web/docs", path: "openapi.yaml" },
      { template: "", path: "openapi.yaml" },
      { template: "C:", path: "web" },
      { template: "D:", path: "openapi.yaml" },
    ];
    expect(read({ assets: [{ source: "contract/openapi.yaml", targets }] })).toEqual([
      `assets[0].targets[0].path: ${pathRule("web")}`,
      `assets[0].targets[1].path: ${pathRule("web")}`,
      `assets[0].targets[2].path: ${pathRule("web")}`,
      `assets[0].targets[3].path: ${pathRule("web")}`,
      `assets[0].targets[4].path: ${pathRule("web")}`,
      `assets[0].targets[5].path: ${pathRule("web")}`,
      `assets[0].targets[6].template: ${TEMPLATE_RULE}`,
      `assets[0].targets[7].template: ${TEMPLATE_RULE}`,
      `assets[0].targets[8].template: ${TEMPLATE_RULE}`,
      `assets[0].targets[9].template: ${TEMPLATE_RULE}`,
      `assets[0].targets[10].template: ${TEMPLATE_RULE}`,
    ]);
  });

  it("원본이 저장소 밖이거나 templates/ 안이거나 없으면 거부한다", () => {
    const targets = [{ template: "web", path: "openapi.yaml" }];
    const sources = [
      "",
      ".",
      "../outside",
      resolve("/outside"),
      "templates",
      "templates/web/openapi.yaml",
      "contract/missing.yaml",
    ];
    expect(read({ assets: sources.map((source) => ({ source, targets })) })).toEqual([
      `assets[0].source: ${SOURCE_RULE}`,
      `assets[1].source: ${SOURCE_RULE}`,
      `assets[2].source: ${SOURCE_RULE}`,
      `assets[3].source: ${SOURCE_RULE}`,
      `assets[4].source: ${SOURCE_RULE}`,
      `assets[5].source: ${SOURCE_RULE}`,
      "assets[6].source: contract/missing.yaml가 없다. 저장소에 있는 파일이나 폴더를 적는다.",
    ]);
  });
});
