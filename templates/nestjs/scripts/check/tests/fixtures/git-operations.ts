import { execFileSync } from "node:child_process";
import { gitEnvironment } from "../../git-environment.js";

const options = { cwd: process.cwd(), env: gitEnvironment(), stdio: "pipe" as const };
execFileSync("git", ["init", "--quiet"], options);
execFileSync("git", ["add", "src/generated/inner.ts"], options);
