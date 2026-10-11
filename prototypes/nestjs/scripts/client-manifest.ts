import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
export function clientManifest(): void {
  const root = resolve(import.meta.dirname, "../src/generated/prisma");
  const files = globSync("**/*.ts", { cwd: root })
    .sort()
    .map((path) => {
      const bytes = readFileSync(resolve(root, path));
      return {
        path,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    });
  const manifest = {
    platform: process.platform,
    prisma: "7.10.0",
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    fileCount: files.length,
    digest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
  const output = resolve(import.meta.dirname, "../.cache");
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "prisma-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `Prisma client: ${String(manifest.fileCount)} files, ${String(manifest.totalBytes)} bytes, digest ${manifest.digest}`,
  );
}
