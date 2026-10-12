import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mail } from "./sender.js";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
export function renderVerification(
  directory: string,
  locale: string,
  to: string,
  context: { name: string; link: string },
): Mail {
  if (locale !== "ko" && locale !== "en") throw new Error("Unsupported mail locale.");
  const render = (suffix: string) =>
    readFileSync(join(directory, locale, `verification.${suffix}`), "utf8")
      .replace(/{{(name|link)}}/g, (_match, key: "name" | "link") =>
        suffix === "html" ? escape(context[key]) : context[key],
      )
      .trim();
  return { to, subject: render("subject.txt"), text: render("txt"), html: render("html") };
}
