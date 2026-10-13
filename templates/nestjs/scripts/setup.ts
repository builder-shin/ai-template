import { execFileSync } from "node:child_process";
import { databaseUrls, ensureDatabases } from "./db/databases.js";
import { migrate } from "./db/migrate.js";
import { generate } from "./gen.js";
import { prepareEnvironment } from "./setup-env.js";
import { isMain, main, scriptSettings } from "./runtime.js";
export async function setup(): Promise<void> {
  prepareEnvironment(".env", ".env.example");
  const settings = scriptSettings();
  execFileSync("docker", ["compose", "up", "-d", "--wait"], { stdio: "inherit" });
  await ensureDatabases(settings.DATABASE_URL);
  await generate();
  for (const url of databaseUrls(settings.DATABASE_URL)) await migrate(url);
}
if (isMain(import.meta.url)) await main(setup);
