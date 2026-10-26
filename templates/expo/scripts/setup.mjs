import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { root, run, pnpmCommand } from "./process.mjs";

try {
  run(pnpmCommand(["install", "--frozen-lockfile"]));
  // Only a repository rooted at this app may install hooks; a parent checkout is never modified.
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (
    git.status === 0 &&
    resolve(git.stdout.trim()).toLowerCase() === root.toLowerCase() &&
    existsSync(resolve(root, "lefthook.yml"))
  )
    run(pnpmCommand(["exec", "lefthook", "install"]));
  console.log(
    "Setup complete. Use explicit public endpoints; see docs/recipes/development.md for native SDK requirements.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
