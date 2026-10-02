import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import * as skillChecks from "./skills";
import {
  checkInstalledSkill,
  checkOfficialSkills,
  checkSkillCopies,
  installedSkill,
  officialSkills,
  type SkillSource,
} from "./skills";
import { readProjectFiles } from "./files";
import { assembleSteps } from "./steps";

const templateRoot = fileURLToPath(new URL("../../", import.meta.url));
const temporary: { files: Set<string>; directories: Set<string> }[] = [];

function skillProject() {
  mkdirSync(join(templateRoot, ".cache"), { recursive: true });
  const root = mkdtempSync(join(templateRoot, ".cache/official-skills-"));
  const created = { files: new Set<string>(), directories: new Set([root]) };
  temporary.push(created);
  const write = (relative: string, text: string) => {
    const path = join(root, relative);
    for (let dir = dirname(path); dir.startsWith(root); dir = dirname(dir)) {
      created.directories.add(dir);
      if (dir === root) break;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    created.files.add(path);
  };
  for (const entry of officialSkills) {
    write(
      "node_modules/" + entry.package + "/package.json",
      JSON.stringify({ version: entry.version }),
    );
    for (const name of Object.keys(entry.files)) {
      const path = ".claude/skills/" + entry.name + "/" + name;
      const text = readFileSync(join(templateRoot, path), "utf8");
      write(path, text);
      if (entry.installedDirectory)
        write("node_modules/" + entry.package + "/" + entry.installedDirectory + "/" + name, text);
    }
  }
  return { root, write, created };
}

afterEach(() => {
  for (const created of temporary.splice(0)) {
    for (const path of created.files) rmSync(path, { force: true });
    for (const dir of [...created.directories].sort((a, b) => b.length - a.length)) rmdirSync(dir);
  }
});

const content = "---\nname: sample\n---\n# 공식 skill\n";
const source: SkillSource = {
  name: "sample",
  package: "sample-package",
  version: "1.2.3",
  url: "https://example.com/pinned/skills/sample",
  commit: "a".repeat(40),
  installedDirectory: null,
  files: {
    "SKILL.md": createHash("sha256").update(content).digest("hex"),
    "references/guide.md": createHash("sha256").update("# 안내\n").digest("hex"),
  },
};
const prefix = ".claude/skills/sample/";
const copies = {
  [`${prefix}SKILL.md`]: content,
  [`${prefix}references/guide.md`]: "# 안내\n",
};

it("고정 원본과 같은 파일은 CRLF여도 통과한다", () => {
  expect(checkSkillCopies(copies, [source])).toEqual([]);
  expect(
    checkSkillCopies(
      Object.fromEntries(
        Object.entries(copies).map(([path, text]) => [path, text.replaceAll("\n", "\r\n")]),
      ),
      [source],
    ),
  ).toEqual([]);
});

it("본문 변경과 삭제된 참조 파일을 경로별로 거절한다", () => {
  expect(checkSkillCopies({ ...copies, [`${prefix}SKILL.md`]: "변경" }, [source])).toEqual([
    expect.stringContaining(`${prefix}SKILL.md:1 skill-copy`),
  ]);
  expect(checkSkillCopies({ [`${prefix}SKILL.md`]: content }, [source])).toEqual([
    expect.stringContaining(`${prefix}references/guide.md:1 skill-copy`),
  ]);
});

it("빈 사본과 원본에 없는 추가 파일을 거절한다", () => {
  expect(checkSkillCopies({}, [source])).toHaveLength(2);
  expect(checkSkillCopies({ ...copies, [`${prefix}extra.md`]: "추가" }, [source])).toEqual([
    expect.stringContaining(`${prefix}extra.md:1 skill-copy`),
  ]);
});

it("레시피 skill은 공식 사본 검사에서 제외한다", () => {
  expect(
    checkSkillCopies({ ...copies, ".claude/skills/add-page/SKILL.md": "레시피" }, [source]),
  ).toEqual([]);
});

it("설치 패키지의 버전과 skill 원본도 고정값과 비교한다", () => {
  const packaged = { ...source, installedDirectory: "skills/sample" };
  const installed = { "SKILL.md": content, "references/guide.md": "# 안내\n" };
  expect(checkInstalledSkill(packaged, "1.2.3", installed)).toEqual([]);
  expect(checkInstalledSkill(packaged, "1.2.4", installed).join()).toContain("1.2.3");
  expect(
    checkInstalledSkill(packaged, "1.2.3", { ...installed, "SKILL.md": "변경" }).join(),
  ).toContain("node_modules/sample-package/skills/sample/SKILL.md:1 skill-copy");
  expect(checkInstalledSkill(packaged, "1.2.3", {}).length).toBe(2);
  expect(checkInstalledSkill(packaged, null, {}).join()).toContain(
    "pnpm install --frozen-lockfile",
  );
});

it("package.json을 export하지 않는 shadcn도 프로젝트 안에서 찾는다", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const shadcn = officialSkills.find((entry) => entry.name === "shadcn")!;
  expect(installedSkill(root, shadcn).version).toBe("4.21.0");
  expect(checkOfficialSkills(root, readProjectFiles(root))).toEqual([]);
});

it.each(["버전 변경", "패키지 삭제", "원문 변경"])(
  "실제 설치 상태만 바뀌면 harness 키와 검사 결과가 바뀐다: %s",
  (change) => {
    const project = skillProject();
    const files = readProjectFiles(project.root);
    const key = () =>
      assembleSteps(files, false, [], {}, skillChecks.installedSkillState(project.root)).find(
        (step) => step.name === "harness",
      )!.key;
    const previous = key();
    expect(checkOfficialSkills(project.root, files)).toEqual([]);
    if (change === "버전 변경")
      project.write("node_modules/next/package.json", JSON.stringify({ version: "16.3.9" }));
    else if (change === "패키지 삭제") rmSync(join(project.root, "node_modules/next/package.json"));
    else project.write("node_modules/@playwright/cli/skills/playwright-cli/SKILL.md", "변경");
    expect(readProjectFiles(project.root)).toEqual(files);
    expect(key()).not.toBe(previous);
    expect(checkOfficialSkills(project.root, files).length).toBeGreaterThan(0);
  },
);
