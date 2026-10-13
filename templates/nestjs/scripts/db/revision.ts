import { assertProjectDatabase } from "./guard.js";
import { isMain, main, prismaCommand, scriptSettings } from "../runtime.js";
export async function revision(url: string, args: readonly string[]): Promise<number> {
  if (args.length !== 1 || !args[0]) {
    process.stderr.write("사용법: pnpm db:revision <이름>\n");
    return 2;
  }
  await assertProjectDatabase(url);
  prismaCommand(url, ["migrate", "dev", "--create-only", "--name", args[0]]);
  return 0;
}
if (isMain(import.meta.url))
  await main(() => {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0]) return revision("", args);
    return revision(scriptSettings().DATABASE_URL, args);
  });
