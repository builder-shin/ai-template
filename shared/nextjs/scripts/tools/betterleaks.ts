import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// FastAPI 하네스와 같은 릴리스와 SHA-256. 버전을 올릴 때 checksums.txt도 확인한다.
const version = "1.8.1";
const assets: Record<string, [string, string]> = {
  "win32-x64": [
    "windows_x64.zip",
    "94310d028285a1bcce7f160bc19eb62f87de6460c95bfd4319151ef5b501ed3f",
  ],
  "linux-x64": [
    "linux_x64.tar.gz",
    "efa407244e1ea8e35f582b8a42becdeac08bdead04f68eb752adda722d583c2a",
  ],
  "linux-arm64": [
    "linux_arm64.tar.gz",
    "bbb578b12a2f65d7082ab436abf37724232bc71d8a078e3c41336574420f1b48",
  ],
  "darwin-x64": [
    "darwin_x64.tar.gz",
    "6abc37df76f881cffae406aa2cec72bea6e6ae64b4e771b3ed21b4aac472ed10",
  ],
  "darwin-arm64": [
    "darwin_arm64.tar.gz",
    "8e80f33b5f2a7426b390347b9fd466033723cb94b6bdffa7572632e2eaec964e",
  ],
};

export function verifyChecksum(data: Uint8Array, expected: string) {
  if (createHash("sha256").update(data).digest("hex") !== expected) {
    throw new Error("Betterleaks 체크섬이 다르다. 릴리스와 고정 SHA-256을 확인한다.");
  }
}

export async function ensureBetterleaks(cache: string): Promise<string> {
  const platform = `${process.platform}-${process.arch}`;
  const asset = assets[platform];
  if (!asset) throw new Error(`Betterleaks: 지원하지 않는 플랫폼 ${platform}`);
  const folder = join(cache, `betterleaks-${version}-${platform}`);
  const binary = join(folder, process.platform === "win32" ? "betterleaks.exe" : "betterleaks");
  if (existsSync(binary)) return binary;
  const file = `betterleaks_${version}_${asset[0]}`;
  const response = await fetch(
    `https://github.com/betterleaks/betterleaks/releases/download/v${version}/${file}`,
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error(`Betterleaks 다운로드 실패: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  verifyChecksum(bytes, asset[1]);
  mkdirSync(folder, { recursive: true });
  const archive = join(folder, file);
  writeFileSync(archive, bytes);
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  const extracted = spawnSync(tar, ["-xf", archive, "-C", folder], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (extracted.status !== 0 || !existsSync(binary))
    throw new Error(`Betterleaks 압축을 풀지 못했다: ${extracted.stderr}`);
  unlinkSync(archive);
  if (process.platform !== "win32") chmodSync(binary, 0o755);
  return binary;
}
