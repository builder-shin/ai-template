import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { root } from "../process.mjs";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (
      [
        "node_modules",
        ".git",
        ".expo",
        ".cache",
        "contract",
        "generated",
        "android",
        "ios",
        "dist",
        "coverage",
        "artifacts",
      ].includes(entry.name) ||
      entry.name.startsWith(".env")
    )
      return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const problems: string[] = [];
for (const path of files(root)) {
  if (path.endsWith("AGENTS.md") && !existsSync(join(path, "..", "CLAUDE.md")))
    problems.push(`${path}:1 missing CLAUDE.md.`);
  if (/\.[cm]?[jt]sx?$/.test(path)) {
    const text = readFileSync(path, "utf8");
    const max = /\.test\./.test(path) ? 600 : 400;
    if (text.trimEnd().split("\n").length > max)
      problems.push(`${path}:1 split source beyond ${max} lines.`);
    if (
      text
        .split("\n")
        .some(
          (line) =>
            /^\s*(?:\/\/|\/\*|\*)\s*(?:eslint-disable|@ts-ignore)\b/.test(line) &&
            !line.includes("—"),
        )
    )
      problems.push(`${path}:1 explain suppressions.`);
  }
}
const ko: unknown = JSON.parse(
  readFileSync(resolve(root, "src/lib/i18n/messages/ko.json"), "utf8"),
);
const en: unknown = JSON.parse(
  readFileSync(resolve(root, "src/lib/i18n/messages/en.json"), "utf8"),
);
if (
  JSON.stringify(Object.keys(ko as object).sort()) !==
  JSON.stringify(Object.keys(en as object).sort())
)
  problems.push("messages:1 align ko/en keys.");
if (problems.length) throw new Error(problems.join("\n"));
console.log("Harness valid.");
