import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { parseAllDocuments } from "yaml";
import { rewriteImporters } from "../src/lockfile.ts";
import { copySnapshotFiles, fixtureRepository, git, temporaryFolder } from "./helpers.ts";

vi.mock("yaml", async (original) => {
  const yaml = await original<typeof import("yaml")>();
  return { ...yaml, parseAllDocuments: vi.fn(yaml.parseAllDocuments) };
});

it("잠금 문서를 한 번 파싱해서 importer를 옮긴다", () => {
  vi.mocked(parseAllDocuments).mockClear();
  const result = rewriteImporters("importers:\n  .: {}\n");
  expect(result).toContain("apps/web:");
  expect(parseAllDocuments).toHaveBeenCalledTimes(1);
});

it("작업 트리 스냅샷은 삭제된 인덱스 파일을 건너뛰고 나머지 바이트를 보존한다", () => {
  const source = fixtureRepository();
  unlinkSync(join(source, "templates/nextjs/README.md"));
  const target = temporaryFolder();
  const files = git(source, "ls-files", "-z").split("\0").filter(Boolean);
  copySnapshotFiles(source, target, files);
  expect(existsSync(join(target, "templates/nextjs/README.md"))).toBe(false);
  expect(readFileSync(join(target, "templates/nextjs/package.json"))).toEqual(
    readFileSync(join(source, "templates/nextjs/package.json")),
  );
});
