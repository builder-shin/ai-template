import { assertLocalDatabase, assertProjectDatabase } from "./guard.js";
import { isMain, main, prismaCommand, scriptSettings } from "../runtime.js";
export async function reset(url: string): Promise<void> {
  assertLocalDatabase(url);
  await assertProjectDatabase(url);
  prismaCommand(url, ["migrate", "reset", "--force"]);
}
if (isMain(import.meta.url)) await main(() => reset(scriptSettings().DATABASE_URL));
