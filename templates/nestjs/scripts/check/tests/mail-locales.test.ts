import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { mailLocaleProblems } from "../mail-locales.js";
let root: string;
function write(path: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), "문구");
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-mail-locales-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("한 로케일의 메일만 있으면 다른 로케일의 세 형식 누락을 알린다", () => {
  for (const suffix of ["subject.txt", "txt", "html"])
    write(`src/modules/auth/templates/ko/welcome.${suffix}`);
  expect(mailLocaleProblems(root)).toEqual([
    "src/modules/auth/templates/en/welcome.subject.txt가 없다",
    "src/modules/auth/templates/en/welcome.txt가 없다",
    "src/modules/auth/templates/en/welcome.html가 없다",
  ]);
});
it("두 로케일의 같은 메일과 형식이 있으면 통과한다", () => {
  for (const locale of ["ko", "en"])
    for (const suffix of ["subject.txt", "txt", "html"])
      write(`src/modules/auth/templates/${locale}/welcome.${suffix}`);
  expect(mailLocaleProblems(root)).toEqual([]);
});
it("한 형식만 있어도 메일을 발견하고 나머지 형식 누락을 알린다", () => {
  write("src/modules/posts/templates/en/notice.html");
  expect(mailLocaleProblems(root)).toEqual([
    "src/modules/posts/templates/ko/notice.subject.txt가 없다",
    "src/modules/posts/templates/ko/notice.txt가 없다",
    "src/modules/posts/templates/ko/notice.html가 없다",
    "src/modules/posts/templates/en/notice.subject.txt가 없다",
    "src/modules/posts/templates/en/notice.txt가 없다",
  ]);
});
it("메일이 없는 모듈과 무관한 파일은 허용한다", () => {
  write("src/modules/posts/index.ts");
  write("src/modules/posts/templates/README.md");
  expect(mailLocaleProblems(root)).toEqual([]);
});
it("심볼릭 링크를 메일 템플릿으로 세지 않는다", () => {
  write("src/modules/auth/templates/ko/welcome.html");
  mkdirSync(join(root, "src/modules/auth/templates/en"));
  symlinkSync("../ko/welcome.html", join(root, "src/modules/auth/templates/en/welcome.html"));
  expect(mailLocaleProblems(root)).toContain("src/modules/auth/templates/en/welcome.html가 없다");
});
