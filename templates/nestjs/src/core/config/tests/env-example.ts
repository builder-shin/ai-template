import { readFileSync } from "node:fs";

export function exampleEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(new URL("../../../../.env.example", import.meta.url), "utf8")
      .split("\n")
      .flatMap((line) => {
        const match = /^([A-Z][A-Z0-9_]*)=(.*?)(?:\s+#.*)?$/.exec(line);
        return match ? [[match[1] as string, match[2] as string]] : [];
      }),
  );
}
