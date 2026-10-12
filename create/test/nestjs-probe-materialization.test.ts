import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { materializePrototype, type MaterializationRun } from "./nestjs-probe-materialization.ts";
import { fixtureRepository, git, write } from "./helpers.ts";

function fixture() {
  const clone = fixtureRepository();
  write(clone, "prototypes/nestjs/.gitignore", "node_modules/\nsrc/generated/\n");
  write(clone, "prototypes/nestjs/source.txt", "바이트\r\n보존\u0000\n");
  write(clone, "prototypes/nestjs/bin/start.sh", "#!/bin/sh\necho fixture\n");
  git(clone, "add", "--", "prototypes/nestjs");
  git(clone, "update-index", "--chmod=+x", "prototypes/nestjs/bin/start.sh");
  if (process.platform !== "win32") chmodSync(join(clone, "prototypes/nestjs/bin/start.sh"), 0o755);
  git(clone, "commit", "-m", "chore: tracked preparation fixture");
  write(clone, "prototypes/nestjs/untracked.txt", "must not copy\n");
  return { clone, template: join(clone, "templates/nestjs") };
}

function commands(clone: string, template: string, fail?: "install" | "gen" | "mutate") {
  const calls: { command: string; args: string[]; cwd: string }[] = [];
  let installed = false;
  let generated = false;
  const run: MaterializationRun = (_label, command, args, { cwd }) => {
    calls.push({ command, args, cwd });
    if (command === "pnpm") {
      expect(cwd).toBe(template);
      expect(readFileSync(join(template, "source.txt"))).toEqual(
        readFileSync(join(clone, "prototypes/nestjs/source.txt")),
      );
      expect(existsSync(join(template, "untracked.txt"))).toBe(false);
      if (args[0] === "install") {
        expect(args).toEqual(["install", "--frozen-lockfile"]);
        if (fail === "install") throw Error("inert frozen installation failed");
        installed = true;
        write(template, "node_modules/inert.txt", "inert installation only\n");
      } else {
        expect(args).toEqual(["run", "gen"]);
        expect(installed).toBe(true);
        expect(JSON.parse(readFileSync(join(template, "template.json"), "utf8"))).toEqual({
          name: "nestjs",
          kind: "backend",
          runner: "pnpm",
          goldenModule: "src/modules/posts",
        });
        if (fail === "gen") throw Error("inert source generation failed");
        generated = true;
        write(template, "src/generated/inert.ts", "export {};\n");
        if (fail === "mutate") writeFileSync(join(template, "source.txt"), "changed\n");
      }
      return { stdout: "" };
    }
    expect(command).toBe("git");
    expect(cwd).toBe(clone);
    if (args[0] === "commit" && !(installed && generated))
      throw Error("ordinary commit requires copied workspace installation and generated types");
    return { stdout: git(cwd, ...args) };
  };
  return { calls, run };
}

it.skipIf(process.platform === "win32")(
  "copied tracked bytes and modes survive install/gen before ordinary staging and commit",
  () => {
    const { clone, template } = fixture();
    const before = git(clone, "rev-parse", "HEAD");
    const { calls, run } = commands(clone, template);
    const files = materializePrototype(clone, run);
    expect(calls.map(({ command, args }) => [command, ...args])).toEqual([
      ["git", "ls-files", "--stage", "-z", "--", "prototypes/nestjs"],
      ["pnpm", "install", "--frozen-lockfile"],
      ["pnpm", "run", "gen"],
      ["git", "add", "--", "templates/nestjs"],
      ["git", "commit", "-m", "chore: materialize tracked NestJS probe template"],
    ]);
    expect(git(clone, "rev-parse", "HEAD^")).toBe(before);
    expect(git(clone, "status", "--porcelain", "--", "templates/nestjs")).toBe("");
    expect(files.map((file) => file.path)).toEqual([
      "prototypes/nestjs/.gitignore",
      "prototypes/nestjs/bin/start.sh",
      "prototypes/nestjs/source.txt",
    ]);
    for (const file of files) {
      const original = readFileSync(join(clone, file.path));
      const copied = join(template, file.path.slice("prototypes/nestjs/".length));
      expect(readFileSync(copied)).toEqual(original);
      expect(file.bytes).toBe(original.length);
      expect(file.sha256).toBe(createHash("sha256").update(original).digest("hex"));
      expect(git(clone, "ls-files", "--stage", "--", copied).slice(0, 6)).toBe(file.mode);
      if (process.platform !== "win32")
        expect(statSync(copied).mode & 0o777).toBe(file.mode === "100755" ? 0o755 : 0o644);
    }
    expect(
      git(
        clone,
        "ls-files",
        "--",
        "templates/nestjs/node_modules",
        "templates/nestjs/src/generated",
        "templates/nestjs/untracked.txt",
      ),
    ).toBe("");
  },
);

it.each(["install", "gen"] as const)("%s failure prevents staging and commit", (failure) => {
  const { clone, template } = fixture();
  const before = git(clone, "rev-parse", "HEAD");
  const { calls, run } = commands(clone, template, failure);
  expect(() => materializePrototype(clone, run)).toThrow(
    failure === "install" ? "inert frozen installation failed" : "inert source generation failed",
  );
  expect(
    calls.filter(
      ({ command, args }) => command === "git" && ["add", "commit"].includes(args[0] ?? ""),
    ),
  ).toEqual([]);
  expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  expect(git(clone, "diff", "--cached", "--name-only")).toBe("");
  if (failure === "install")
    expect(calls.filter(({ command }) => command === "pnpm")).toHaveLength(1);
});

it("bootstrap changing a copied tracked byte prevents staging and commit", () => {
  const { clone, template } = fixture();
  const before = git(clone, "rev-parse", "HEAD");
  const { calls, run } = commands(clone, template, "mutate");
  expect(() => materializePrototype(clone, run)).toThrow("Copied tracked file changed");
  expect(
    calls.filter(
      ({ command, args }) => command === "git" && ["add", "commit"].includes(args[0] ?? ""),
    ),
  ).toEqual([]);
  expect(git(clone, "rev-parse", "HEAD")).toBe(before);
  expect(git(clone, "diff", "--cached", "--name-only")).toBe("");
});
