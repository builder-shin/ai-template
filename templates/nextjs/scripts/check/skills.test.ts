import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  checkInstalledSkill,
  checkOfficialSkills,
  checkSkillCopies,
  installedSkill,
  officialSkills,
  type SkillSource,
} from "./skills";
import { readProjectFiles } from "./files";

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
