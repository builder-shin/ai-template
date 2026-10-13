import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadMailTemplates } from "../templates.js";
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aitpl-mail-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
it("선택한 모듈과 로케일의 세 파일을 그대로 읽는다", () => {
  for (const locale of ["ko", "en"]) {
    const dir = join(root, "templates", locale);
    mkdirSync(dir, { recursive: true });
    for (const suffix of ["subject.txt", "txt", "html"])
      writeFileSync(join(dir, `welcome.${suffix}`), `${locale}:${suffix}\n`);
  }
  expect(loadMailTemplates(root, "welcome", "en")).toEqual({
    subject: "en:subject.txt\n",
    text: "en:txt\n",
    html: "en:html\n",
  });
});
it("파일이 없으면 다른 로케일로 대체하지 않는다", () => {
  expect(() => loadMailTemplates(root, "welcome", "ko")).toThrow(/ENOENT/);
});
