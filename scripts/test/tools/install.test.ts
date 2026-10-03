import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentPlatform,
  downloadUrl,
  ensureTool,
  type InstallDeps,
} from "../../src/tools/install.ts";
import { isToolName, PLATFORMS, TOOLS, type ToolSpec } from "../../src/tools/manifest.ts";

const payload = new TextEncoder().encode("fake archive");
const payloadSha = createHash("sha256").update(payload).digest("hex");

const fakeTool: ToolSpec = {
  name: "fake",
  version: "1.0.0",
  repo: "acme/fake",
  tag: "v1.0.0",
  binary: "fake",
  assets: {
    "linux-x64": { file: "fake_linux.tar.gz", sha256: payloadSha },
    "win32-x64": { file: "fake_windows.zip", sha256: payloadSha },
  },
};

function fakeDeps() {
  const downloads: string[] = [];
  const deps: InstallDeps = {
    download(url) {
      downloads.push(url);
      return Promise.resolve(payload);
    },
    extract(_archive, destination) {
      writeFileSync(join(destination, "fake"), "binary");
      writeFileSync(join(destination, "fake.exe"), "binary");
    },
  };
  return { downloads, deps };
}

describe("currentPlatform", () => {
  it("플랫폼과 아키텍처를 합쳐 키를 만든다", () => {
    expect(currentPlatform("win32", "x64")).toBe("win32-x64");
    expect(currentPlatform("darwin", "arm64")).toBe("darwin-arm64");
  });

  it("지원하지 않는 조합이면 지원 목록과 함께 알린다", () => {
    expect(() => currentPlatform("freebsd", "x64")).toThrow(/지원하지 않는 플랫폼: freebsd-x64/);
  });
});

describe("ensureTool", () => {
  it("GitHub 릴리스 주소에서 받아 설치하고, 두 번째에는 캐시를 쓴다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const { downloads, deps } = fakeDeps();

    const first = await ensureTool(fakeTool, cacheDir, deps, "linux-x64");
    const second = await ensureTool(fakeTool, cacheDir, deps, "linux-x64");

    expect(existsSync(first)).toBe(true);
    expect(second).toBe(first);
    expect(downloads).toEqual([
      "https://github.com/acme/fake/releases/download/v1.0.0/fake_linux.tar.gz",
    ]);
  });

  it("Windows에서는 .exe 실행 파일을 찾는다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const installed = await ensureTool(fakeTool, cacheDir, fakeDeps().deps, "win32-x64");
    expect(installed.endsWith("fake.exe")).toBe(true);
  });

  it("체크섬이 다르면 압축을 풀지 않고 멈춘다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    const tampered: ToolSpec = {
      ...fakeTool,
      assets: { "linux-x64": { file: "fake_linux.tar.gz", sha256: "0".repeat(64) } },
    };
    await expect(ensureTool(tampered, cacheDir, fakeDeps().deps, "linux-x64")).rejects.toThrow(
      /체크섬이 맞지 않다/,
    );
  });

  it("해당 플랫폼 바이너리가 없으면 알린다", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "tools-"));
    await expect(ensureTool(fakeTool, cacheDir, fakeDeps().deps, "darwin-arm64")).rejects.toThrow(
      /darwin-arm64용 바이너리를 제공하지 않는다/,
    );
  });
});

describe("manifest", () => {
  it("actionlint을 지원 플랫폼의 릴리스 자산으로 설치한다", async () => {
    expect(isToolName("actionlint")).toBe(true);
    const tool: ToolSpec | undefined = Object.values(TOOLS).find(
      ({ name }) => name === "actionlint",
    );
    expect(tool).toBeDefined();
    if (tool === undefined) return;
    const cacheDir = mkdtempSync(join(tmpdir(), "actionlint-test-"));
    try {
      for (const platform of PLATFORMS) {
        const asset = tool.assets[platform];
        expect(asset).toBeDefined();
        if (asset === undefined) continue;
        const fixture = { ...tool, assets: { [platform]: { ...asset, sha256: payloadSha } } };
        const installed = await ensureTool(
          fixture,
          cacheDir,
          {
            download(url) {
              expect(url).toBe(
                `https://github.com/rhysd/actionlint/releases/download/v1.7.12/${asset.file}`,
              );
              return Promise.resolve(payload);
            },
            extract(_archive, destination) {
              writeFileSync(
                join(destination, platform === "win32-x64" ? "actionlint.exe" : "actionlint"),
                "binary",
              );
            },
          },
          platform,
        );
        expect(existsSync(installed)).toBe(true);
      }
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("모든 도구가 지원 플랫폼마다 sha256을 가진다", () => {
    for (const tool of Object.values(TOOLS)) {
      for (const asset of Object.values(tool.assets)) {
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(downloadUrl(tool, asset)).toContain(`/releases/download/${tool.tag}/`);
      }
    }
  });
});
