import { LOCALES } from "../../src/core/config/locale.js";
import { projectFiles } from "./files.js";
const FORMATS = ["subject.txt", "txt", "html"] as const;
export function mailLocaleProblems(root: string): string[] {
  const files = projectFiles(root);
  const available = new Set(files);
  const mails = new Set<string>();
  for (const file of files) {
    const match = /^(src\/modules\/[^/]+\/templates)\/([^/]+)\/([^/]+)$/.exec(file);
    const [, dir, locale, filename] = match ?? [];
    if (!dir || !filename || !LOCALES.some((value) => value === locale)) continue;
    const format = FORMATS.find((value) => filename.endsWith(`.${value}`));
    if (!format) continue;
    const name = filename.slice(0, -format.length - 1);
    if (name) mails.add(`${dir}/${name}`);
  }
  const problems: string[] = [];
  for (const mail of [...mails].sort()) {
    const slash = mail.lastIndexOf("/");
    const dir = mail.slice(0, slash);
    const name = mail.slice(slash + 1);
    for (const locale of LOCALES)
      for (const format of FORMATS) {
        const path = `${dir}/${locale}/${name}.${format}`;
        if (!available.has(path)) problems.push(`${path}가 없다`);
      }
  }
  return problems;
}
