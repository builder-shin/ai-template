import { assertProjectDatabase } from "./guard.js";
import { isMain, main, prismaCommand, scriptSettings } from "../runtime.js";
export async function migrate(url: string): Promise<void> {
  await assertProjectDatabase(url);
  prismaCommand(url, ["migrate", "deploy"]);
}
if (isMain(import.meta.url)) await main(() => migrate(scriptSettings().DATABASE_URL));
