import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORMS, type Platform, type ToolAsset, type ToolSpec } from "./manifest.ts";

export interface InstallDeps {
  readonly download: (url: string) => Promise<Uint8Array>;
  readonly extract: (archive: string, destination: string) => void;
}

export function currentPlatform(platform: string = process.platform, arch: string = process.arch) {
  const key = `${platform}-${arch}`;
  const found = PLATFORMS.find((candidate) => candidate === key);
  if (found === undefined) {
    throw new Error(`지원하지 않는 플랫폼: ${key}. 지원 목록: ${PLATFORMS.join(", ")}`);
  }
  return found;
}

export function downloadUrl(tool: ToolSpec, asset: ToolAsset): string {
  return `https://github.com/${tool.repo}/releases/download/${tool.tag}/${asset.file}`;
}

export function verifySha256(data: Uint8Array, asset: ToolAsset): void {
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== asset.sha256) {
    throw new Error(
      `${asset.file} 체크섬이 맞지 않다(기대 ${asset.sha256}, 실제 ${actual}). 받은 파일이 변조됐거나 manifest가 틀렸다.`,
    );
  }
}

/** 실제 네트워크와 시스템 tar를 쓴다. Windows는 zip도 푸는 내장 bsdtar(System32)를 쓴다. */
export const defaultDeps: InstallDeps = {
  async download(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 다운로드 실패: HTTP ${String(response.status)}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  extract(archive, destination) {
    const tar =
      process.platform === "win32"
        ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    const result = spawnSync(tar, ["-xf", archive, "-C", destination], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`${archive} 압축 해제 실패`);
  },
};

function findFile(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** 도구를 캐시 폴더에 설치하고 실행 파일 경로를 돌려준다. 이미 설치돼 있으면 다시 받지 않는다. */
export async function ensureTool(
  tool: ToolSpec,
  cacheDir: string,
  deps: InstallDeps = defaultDeps,
  platform: Platform = currentPlatform(),
): Promise<string> {
  const asset = tool.assets[platform];
  if (asset === undefined) {
    throw new Error(`${tool.name} ${tool.version}은 ${platform}용 바이너리를 제공하지 않는다.`);
  }
  const dir = join(cacheDir, `${tool.name}-${tool.version}-${platform}`);
  const binary = platform.startsWith("win32") ? `${tool.binary}.exe` : tool.binary;
  const cached = existsSync(dir) ? findFile(dir, binary) : undefined;
  if (cached !== undefined) return cached;

  const data = await deps.download(downloadUrl(tool, asset));
  verifySha256(data, asset);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, asset.file);
  writeFileSync(archive, data);
  deps.extract(archive, dir);
  rmSync(archive);

  const installed = findFile(dir, binary);
  if (installed === undefined) throw new Error(`${asset.file} 안에 ${binary}가 없다`);
  if (!platform.startsWith("win32")) chmodSync(installed, 0o755);
  return installed;
}
