import { isMain, main, prismaCommand, scriptSettings } from "./runtime.js";
import "reflect-metadata";
import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
export async function updateOpenApi(
  document: unknown,
  path: string,
  check: boolean,
): Promise<void> {
  const text = await format(JSON.stringify(document), { parser: "json" });
  if (!check) {
    await writeFile(path, text);
    return;
  }
  let existing: string | undefined;
  try {
    existing = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing !== text) throw new Error("openapi.json이 선언과 다르다 — pnpm gen을 실행한다");
}
export async function generate(check = false): Promise<void> {
  const settings = scriptSettings();
  prismaCommand(settings.DATABASE_URL, ["generate"]);
  const { createApp } = await import("../src/core/http/create-app.js");
  const { buildOpenApi } = await import("../src/core/jsonapi/openapi/emit.js");
  const { operations } = await import("../src/core/jsonapi/operation.js");
  const { components } = await import("../src/core/jsonapi/schemas.js");
  const app = await createApp({ settings: { ...settings, LOG_LEVEL: "error" } }, false);
  try {
    await updateOpenApi(buildOpenApi(operations(), components()), "openapi.json", check);
  } finally {
    await app.close();
  }
}
if (isMain(import.meta.url))
  await main(async () => {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check")) throw new Error("사용법: pnpm gen [--check]");
    await generate(args.includes("--check"));
  });
