import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkInstalledSkill, installedSkill, officialSkills, skillDigest } from "../check/skills";

const root = fileURLToPath(new URL("../../", import.meta.url));
const copies: [string, string][] = [];
// 원본을 모두 확인한 뒤 쓴다. 내려받기 실패 때 기존 사본을 보존한다.
for (const source of officialSkills) {
  const installed = installedSkill(root, source);
  const problems = checkInstalledSkill(source, installed.version, installed.files);
  if (problems.length) throw new Error(problems.join("\n"));
  for (const [name, digest] of Object.entries(source.files)) {
    let content: string;
    if (source.installedDirectory) {
      content = installed.files[name]!;
    } else {
      const response = await fetch(source.fileUrls?.[name] ?? `${source.url}/${name}`);
      if (!response.ok)
        throw new Error(`${source.name}/${name}: 원본을 받지 못했다 (${response.status}).`);
      content = await response.text();
    }
    if (skillDigest(content) !== digest)
      throw new Error(
        `${source.name}/${name}: 고정 원본과 다르다. sources.json의 출처를 확인한다.`,
      );
    copies.push([join(root, ".claude/skills", source.name, name), content]);
  }
}
for (const [path, content] of copies) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
console.log(`공식 skill 복원: ${officialSkills.length}개, ${copies.length}파일`);
