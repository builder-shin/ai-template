import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type MaterializationRun = (
  label: string,
  command: string,
  args: string[],
  options: { cwd: string },
) => { stdout: string };

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export function materializePrototype(clone: string, run: MaterializationRun) {
  const tracked = run(
    "prototype-tracked",
    "git",
    ["ls-files", "--stage", "-z", "--", "prototypes/nestjs"],
    { cwd: clone },
  )
    .stdout.split("\0")
    .filter(Boolean);
  const materialized = [];
  for (const row of tracked) {
    const tab = row.indexOf("\t"),
      path = row.slice(tab + 1),
      mode = row.slice(0, 6);
    if (!["100644", "100755"].includes(mode)) throw Error("Unsupported source mode");
    const target = join(clone, "templates/nestjs", path.slice("prototypes/nestjs/".length));
    mkdirSync(dirname(target), { recursive: true });
    const bytes = readFileSync(join(clone, path));
    writeFileSync(target, bytes);
    chmodSync(target, mode === "100755" ? 0o755 : 0o644);
    materialized.push({ path, bytes: bytes.length, sha256: sha(bytes), mode });
  }
  writeFileSync(
    join(clone, "templates/nestjs/template.json"),
    JSON.stringify({
      name: "nestjs",
      kind: "backend",
      runner: "pnpm",
      goldenModule: "src/modules/posts",
    }) + "\n",
  );
  const template = join(clone, "templates/nestjs");
  run("clone-template-frozen", "pnpm", ["install", "--frozen-lockfile"], { cwd: template });
  run("clone-template-gen", "pnpm", ["run", "gen"], { cwd: template });
  for (const file of materialized) {
    const target = join(template, file.path.slice("prototypes/nestjs/".length));
    if (
      sha(readFileSync(target)) !== file.sha256 ||
      (statSync(target).mode & 0o777) !== (file.mode === "100755" ? 0o755 : 0o644)
    )
      throw Error("Copied tracked file changed: " + file.path);
  }
  run("clone-add", "git", ["add", "--", "templates/nestjs"], { cwd: clone });
  run(
    "clone-only-ordinary-commit",
    "git",
    ["commit", "-m", "chore: materialize tracked NestJS probe template"],
    { cwd: clone },
  );
  return materialized;
}
