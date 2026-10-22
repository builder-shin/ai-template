import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  rmSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { join, resolve, relative, isAbsolute, delimiter } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../process.mjs";
import { executeOwned } from "./command.mjs";
import { redactNative } from "./redact.mjs";
import manifest from "./manifest.json" with { type: "json" };

export function verifyArchive(bytes, expected) {
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("Maestro archive checksum mismatch; verify the pinned release.");
}
export function assertJavaVersion(output) {
  const major = Number(/(?:version\s+"|openjdk\s+)(\d+)/.exec(output)?.[1]);
  if (major !== manifest.javaMajor)
    throw new Error(
      `Java ${manifest.javaMajor} is required; configure JAVA_HOME for this command.`,
    );
}
export function maestroCommand(java, installation, args, windows) {
  return [
    java,
    "--enable-native-access=ALL-UNNAMED",
    ...(windows ? [`-Daitpl.maestro.stateDir=${windows.state}`] : []),
    "-cp",
    [windows?.classes, join(installation, "lib", "*")].filter(Boolean).join(delimiter),
    manifest.maestro.mainClass,
    ...args,
  ];
}
function validInstallation(folder) {
  const lib = join(folder, "lib");
  return (
    existsSync(lib) &&
    lstatSync(lib).isDirectory() &&
    !lstatSync(lib).isSymbolicLink() &&
    readdirSync(lib).some((name) => name.endsWith(".jar"))
  );
}
export async function ensureMaestro(
  cache = join(root, "node_modules/.cache/expo-native"),
  options = {},
) {
  const base = resolve(cache),
    destination = join(base, `maestro-${manifest.maestro.version}`),
    marker = join(destination, ".verified-archive.json");
  if (existsSync(marker) && validInstallation(destination)) {
    const verified = JSON.parse(readFileSync(marker, "utf8"));
    if (verified.sha256 === manifest.maestro.sha256) return destination;
  }
  if (existsSync(destination))
    throw new Error(
      "Existing Maestro cache is not a verified installation; move it aside and retry.",
    );
  mkdirSync(base, { recursive: true });
  const temporary = mkdtempSync(join(base, ".maestro-install-"));
  let failure;
  try {
    const signal = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(options.signal ? [options.signal] : []),
    ]);
    const response = await fetch(manifest.maestro.url, { signal });
    if (!response.ok) throw new Error(`Maestro download failed: HTTP ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    verifyArchive(bytes, manifest.maestro.sha256);
    const archive = join(temporary, "maestro.zip");
    writeFileSync(archive, bytes);
    const argv =
      process.platform === "win32"
        ? [
            join(process.env.SystemRoot ?? "C:/Windows", "System32/tar.exe"),
            "-xf",
            archive,
            "-C",
            temporary,
          ]
        : ["unzip", "-q", archive, "-d", temporary];
    const result = await (options.execute ?? executeOwned)(argv, {
      cwd: root,
      signal: options.signal,
      capture: true,
    });
    if (result.code !== 0)
      throw new Error("Maestro archive extraction failed; verify unzip/tar is available.");
    const installation = [
      temporary,
      ...readdirSync(temporary).map((name) => join(temporary, name)),
    ].find(
      (candidate) =>
        existsSync(candidate) &&
        lstatSync(candidate).isDirectory() &&
        !lstatSync(candidate).isSymbolicLink() &&
        validInstallation(candidate),
    );
    if (!installation)
      throw new Error("The verified Maestro distribution has no Java library directory.");
    writeFileSync(
      join(installation, ".verified-archive.json"),
      JSON.stringify({ sha256: manifest.maestro.sha256 }),
    );
    renameSync(installation, destination);
  } catch (error) {
    failure = error;
  }
  try {
    if (existsSync(temporary)) {
      const path = relative(base, temporary);
      if (
        isAbsolute(path) ||
        !path.startsWith(".maestro-install-") ||
        path.includes("/") ||
        path.includes("\\") ||
        lstatSync(temporary).isSymbolicLink() ||
        realpathSync.native(temporary) !== resolve(temporary)
      )
        throw new Error("Maestro temporary installation ownership changed.");
      rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  } catch (cleanup) {
    if (failure)
      throw new AggregateError([failure, cleanup], "Maestro installation and cleanup failed.");
    throw cleanup;
  }
  if (failure) throw failure;
  return destination;
}
export function javaExecutable(input = process.env) {
  return input.JAVA_HOME
    ? join(input.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
    : "java";
}
async function main() {
  const args = process.argv.slice(2);
  const installation = await ensureMaestro();
  if (args.length === 1 && args[0] === "--install") {
    console.log(`Maestro ${manifest.maestro.version} archive verified and installed.`);
    return;
  }
  const java = javaExecutable(),
    version = await executeOwned([java, "-version"], { capture: true });
  if (version.code !== 0) throw new Error("Java 21 executable missing; configure JAVA_HOME.");
  assertJavaVersion(version.stdout + version.stderr);
  process.exitCode = (
    await executeOwned(maestroCommand(java, installation, args), {
      env: { MAESTRO_CLI_NO_ANALYTICS: "1" },
    })
  ).code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(redactNative(error.message));
    process.exitCode = 1;
  });
