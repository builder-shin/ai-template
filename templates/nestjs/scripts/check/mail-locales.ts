import { LOCALES } from "../../src/core/config/locale.js";
import { projectFiles } from "./files.js";
export function mailLocaleProblems(root: string): string[] {
  const files = projectFiles(root);
  const available = new Set(files);
  const mails = new Set<string>();
  for (const file of files) {
    const match =
      /^(src\/modules\/[^/]+\/templates)\/(?:ko|en)\/([^/]+?)\.(?:subject\.txt|txt|html)$/.exec(
        file,
      );
    if (match?.[1] && match[2]) mails.add(`${match[1]}/${match[2]}`);
  }
  const problems: string[] = [];
  for (const mail of [...mails].sort()) {
    const slash = mail.lastIndexOf("/");
    const dir = mail.slice(0, slash);
    const name = mail.slice(slash + 1);
    for (const locale of LOCALES)
      for (const suffix of ["subject.txt", "txt", "html"]) {
        const path = `${dir}/${locale}/${name}.${suffix}`;
        if (!available.has(path)) problems.push(`${path}가 없다`);
      }
  }
  return problems;
}
