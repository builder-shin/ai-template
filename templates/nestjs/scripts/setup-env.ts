import { appendFileSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
export function prepareEnvironment(path: string, example: string): void {
  if (!existsSync(path)) {
    copyFileSync(example, path);
    return;
  }
  const currentText = readFileSync(path, "utf8");
  const current = parseEnv(currentText);
  const missing = readFileSync(example, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const key = /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1];
      return key !== undefined && !(key in current);
    });
  if (missing.length)
    appendFileSync(path, `${currentText.endsWith("\n") ? "" : "\n"}${missing.join("\n")}\n`);
}
