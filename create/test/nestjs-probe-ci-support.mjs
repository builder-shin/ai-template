import { gitEnvironment } from "../../scripts/src/files/git-environment.ts";
import { parse } from "yaml";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function immutable(file, value) {
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
    mode: 0o444,
  });
}
export function measures(directory) {
  mkdirSync(directory, { recursive: true });
  const rows = [];
  let sequence = 0;
  function run(label, command, args = [], options = {}) {
    const id = String(++sequence).padStart(3, "0") + "-" + label;
    const pfStart = performance.now();
    const physicalTmp = realpathSync.native(tmpdir());
    const pipe = physicalTmp + "/tsx-" + String(process.getuid()) + "/2147483647.pipe";
    const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
    const preflight = {
      physicalTmp,
      childTmpdir: physicalTmp,
      conservativePipeBytes: Buffer.byteLength(pipe),
      nodeVersion: process.version,
      pnpmVersion: pnpm.stdout?.trim(),
      pnpmNativeExit: pnpm.status,
      elapsedSeconds: (performance.now() - pfStart) / 1000,
    };
    if (
      preflight.conservativePipeBytes >= 100 ||
      pnpm.status !== 0 ||
      preflight.pnpmVersion !== "12.6.0"
    )
      throw Error("CI native preflight failed");
    const utcStart = new Date().toISOString(),
      start = performance.now();
    console.log(
      JSON.stringify({
        phase: "start",
        id,
        command,
        args,
        cwd: options.cwd ?? process.cwd(),
        utcStart,
      }),
    );
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env:
        command === "git"
          ? gitEnvironment({ ...process.env, ...options.env, TMPDIR: physicalTmp })
          : { ...process.env, ...options.env, TMPDIR: physicalTmp },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const utcEnd = new Date().toISOString(),
      elapsedSeconds = (performance.now() - start) / 1000;
    const stdout = result.stdout ?? "",
      stderr = result.stderr ?? "";
    immutable(join(directory, id + ".stdout.log"), stdout);
    immutable(join(directory, id + ".stderr.log"), stderr);
    const row = {
      id,
      command,
      args,
      cwd: options.cwd ?? process.cwd(),
      utcStart,
      utcEnd,
      elapsedSeconds,
      nativeExit: result.status,
      pid: result.pid ?? null,
      signal: result.signal,
      error: result.error?.message ?? null,
      diagnosticNonzeroAllowed: options.allowFailure ?? false,
      preflight,
      stdoutSHA256: sha(stdout),
      stderrSHA256: sha(stderr),
    };
    immutable(join(directory, id + ".execution.json"), row);
    rows.push(row);
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    console.log(JSON.stringify({ nativeMeasurement: row }));
    if ((result.error || result.status !== 0) && !options.allowFailure)
      throw Error(id + " failed (" + String(result.status) + ")");
    return { stdout, stderr, row };
  }
  return { run, rows };
}
export async function closedPorts(ports) {
  for (const port of ports)
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    });
}
export function composeArgs(api, name, ...args) {
  return ["compose", "--project-name", name, "--file", join(api, "compose.yaml"), ...args];
}
export function assertNoCompose(run, api, name) {
  const observations = {};
  for (const [kind, command] of [
    ["containers", "ps"],
    ["networks", "network"],
    ["volumes", "volume"],
  ]) {
    const args =
      command === "ps"
        ? ["ps", "--all", "--quiet", "--filter", "label=com.docker.compose.project=" + name]
        : [command, "ls", "--quiet", "--filter", "label=com.docker.compose.project=" + name];
    const value = run("owned-" + kind, "docker", args).stdout.trim();
    observations[kind] = value;
    if (value) throw Error("Existing resources for " + name);
  }
  return observations;
}
export function cleanupVariant(run, variant) {
  if (variant.composeOwned) {
    run(
      variant.id + "-compose-down",
      "docker",
      composeArgs(variant.api, variant.name, "--profile", "app", "down", "--volumes"),
    );
    assertNoCompose(run, variant.api, variant.name);
  }
  if (variant.imageOwned) {
    const image = run(variant.id + "-image-exists", "docker", ["image", "inspect", variant.image], {
      allowFailure: true,
    });
    if (image.row.nativeExit === 0)
      run(variant.id + "-image-remove", "docker", ["image", "rm", variant.image]);
    const absent = run(
      variant.id + "-image-absent",
      "docker",
      ["image", "inspect", variant.image],
      { allowFailure: true },
    );
    if (absent.row.nativeExit !== 1 || !/No such image/i.test(absent.stderr))
      throw Error("Image cleanup not proved: " + variant.image);
  }
  variant.cleaned = true;
}
export function removeOwnedFolders(state) {
  for (const folder of [...state.folders].reverse()) {
    if (!folder.startsWith(state.runnerTemp + "/aitpl-")) throw Error("Unowned folder " + folder);
    rmSync(folder, { recursive: true, force: true });
    if (existsSync(folder)) throw Error("Owned folder remains " + folder);
  }
}

export function frontendDifferences(clone, target, api, frontends, run, directory, id) {
  const spec = JSON.parse(readFileSync(join(api, "openapi.json"), "utf8")),
    contract = parse(readFileSync(join(clone, "contract/openapi.yaml"), "utf8"));
  const operations = (s) =>
    Object.values(s.paths)
      .flatMap((path) =>
        Object.values(path)
          .filter((op) => op && typeof op === "object" && op.operationId)
          .map((op) => op.operationId),
      )
      .sort();
  const differences = {
    apiOperations: operations(spec),
    contractOperations: operations(contract),
    apiSchemas: Object.keys(spec.components.schemas).sort(),
    contractSchemas: Object.keys(contract.components.schemas).sort(),
    generatedFrontendDifferences: [],
  };
  if (
    differences.apiOperations.length !== 19 ||
    differences.apiSchemas.length !== 83 ||
    differences.contractOperations.length !== 39 ||
    differences.contractSchemas.length !== 126
  )
    throw Error("Partial/full contract counts changed");
  for (const app of frontends) {
    const template = app === "web" ? "nextjs" : "nextjs-admin";
    for (const row of run(
      id + "-" + app + "-generated-source",
      "git",
      ["ls-files", "-z", "--", "templates/" + template],
      { cwd: clone },
    )
      .stdout.split("\0")
      .filter((p) => p.includes("/generated/"))) {
      const original = readFileSync(join(clone, row)),
        path = row.slice(("templates/" + template + "/").length),
        generatedPath = path.startsWith("contract/") ? path : "apps/" + app + "/" + path,
        destination = join(target, generatedPath);
      if (!existsSync(destination)) throw Error("Missing frontend generated file: " + destination);
      const generated = readFileSync(destination);
      differences.generatedFrontendDifferences.push({
        app,
        path,
        generatedPath,
        originalBytes: original.length,
        generatedBytes: generated.length,
        originalSHA256: sha(original),
        generatedSHA256: sha(generated),
        changed: !original.equals(generated),
      });
    }
  }
  differences.missingOperations = differences.contractOperations.filter(
    (n) => !differences.apiOperations.includes(n),
  );
  differences.missingSchemas = differences.contractSchemas.filter(
    (n) => !differences.apiSchemas.includes(n),
  );
  immutable(join(directory, "frontend-gen-differences.json"), differences);
}

export function assertZodOverlap(data, sources, combo) {
  const packages = Object.keys(data.packages)
    .filter((k) => k.startsWith("zod@"))
    .sort();
  const snapshots = Object.keys(data.snapshots)
    .filter((k) => k.startsWith("zod@"))
    .sort();
  const expected = [
    ...new Set(
      sources.flatMap(({ data: source }) =>
        Object.keys(source.packages).filter((k) => k.startsWith("zod@")),
      ),
    ),
  ].sort();
  if (!expected.includes("zod@4.6.5") || packages.join("\n") !== expected.join("\n"))
    throw Error("Overlap version changed: zod");
  for (const { app, data: source } of sources) {
    const original = source.importers["."];
    const actual = data.importers[combo ? "apps/" + app : "."];
    const pin = original?.dependencies?.zod ?? original?.devDependencies?.zod;
    const resolved = actual?.dependencies?.zod ?? actual?.devDependencies?.zod;
    if (
      pin?.specifier !== "4.6.5" ||
      pin.version !== "4.6.5" ||
      resolved?.specifier !== "4.6.5" ||
      resolved.version !== "4.6.5"
    )
      throw Error("Required direct Zod pin changed");
  }
  return {
    packageKeys: packages,
    snapshotKeys: snapshots,
    meaning: "exact selected-source Zod versions; direct4.6.5 retained, no physical-dedup claim",
  };
}
