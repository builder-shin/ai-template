import { isMain, main, prismaCommand, scriptSettings } from "./runtime.js";
export function generate(): void {
  prismaCommand(scriptSettings().DATABASE_URL, ["generate"]);
}
if (isMain(import.meta.url))
  await main(async () => {
    generate();
    await Promise.resolve();
  });
