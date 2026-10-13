import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locale } from "../config/locale.js";
export interface MailTemplates {
  subject: string;
  text: string;
  html: string;
}
export function loadMailTemplates(moduleDir: string, mail: string, locale: Locale): MailTemplates {
  const dir = join(moduleDir, "templates", locale);
  return {
    subject: readFileSync(join(dir, `${mail}.subject.txt`), "utf8"),
    text: readFileSync(join(dir, `${mail}.txt`), "utf8"),
    html: readFileSync(join(dir, `${mail}.html`), "utf8"),
  };
}
