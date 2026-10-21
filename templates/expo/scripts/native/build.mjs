import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  readdirSync,
  appendFileSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { root, pnpmCommand } from "../process.mjs";
import { prepareNativeProject, cleanNativeProject } from "./owned.mjs";
import { executeOwned } from "./command.mjs";
import { buildOptions, buildEnvironment } from "./build-config.mjs";
import {
  buildTools,
  gradleCommand,
  androidArtifact,
  iosProject,
  configureNativeInstall,
  nativeCmakeInit,
} from "./build-tools.mjs";
import { redactNative } from "./redact.mjs";

function localCommand(copy, tool, args) {
  const require = createRequire(join(copy, "package.json")),
    file = require.resolve(`${tool}/package.json`),
    pkg = require(file);
  const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin[tool];
  if (!bin) throw new Error("The pinned local native CLI has no executable.");
  return [process.execPath, join(dirname(file), bin), ...args];
}
export async function buildNative(input, ports = {}) {
  const options = buildOptions([
    "--platform",
    input.platform,
    "--configuration",
    input.configuration ?? "debug",
    "--run-id",
    input.runId,
  ]);
  const source = ports.source ?? root,
    environment = ports.env ?? process.env,
    execute = ports.execute ?? executeOwned,
    signal = ports.signal;
  const runtime = buildEnvironment(options.platform, options.configuration, environment);
  const artifact = join(
    source,
    "artifacts/native",
    options.runId,
    options.platform,
    options.configuration,
    options.platform === "android" ? `app-${options.configuration}.apk` : "app.app",
  );
  if (existsSync(dirname(artifact)))
    throw new Error("Native artifact output already exists; choose another --run-id.");
  const tools = await buildTools(options.platform, environment, execute, signal);
  signal?.throwIfAborted();
  const logFile = join(dirname(dirname(artifact)), `${options.configuration}.build.log`);
  if (existsSync(logFile))
    throw new Error("Native build log already exists; choose another --run-id to preserve it.");
  mkdirSync(dirname(logFile), { recursive: true });
  const output = (line) => {
    appendFileSync(logFile, line);
    process.stdout.write(line);
  };
  const owned = prepareNativeProject(source);
  let failure, produced;
  const env = {
    ...environment,
    ...runtime,
    CI: "1",
    ...(tools.ANDROID_HOME
      ? { ANDROID_HOME: tools.ANDROID_HOME, ANDROID_SDK_ROOT: tools.ANDROID_SDK_ROOT }
      : {}),
  };
  async function run(argv, cwd = owned.path, extra = {}) {
    signal?.throwIfAborted();
    const result = await execute(argv, { cwd, env: { ...env, ...extra }, signal, output });
    if (result.code !== 0)
      throw Object.assign(
        new Error(
          `Native ${options.platform} ${options.configuration} command failed (${result.code}).`,
        ),
        { exitCode: result.code },
      );
    return result;
  }
  try {
    configureNativeInstall(owned);
    const lockFile = join(owned.path, "pnpm-lock.yaml"),
      originalLock = readFileSync(lockFile);
    await run(pnpmCommand(["install", "--frozen-lockfile"]), owned.path, {
      NODE_ENV: "development",
    });
    if (!readFileSync(lockFile).equals(originalLock))
      throw new Error("Frozen native installation changed its original lock bytes.");
    await run(
      localCommand(owned.path, "expo", [
        "prebuild",
        "--clean",
        "--no-install",
        "--platform",
        options.platform,
      ]),
      owned.path,
      { NODE_ENV: "development" },
    );
    if (options.platform === "android") {
      await run(
        gradleCommand(
          tools.java,
          owned.path,
          options.configuration,
          environment,
          nativeCmakeInit(owned),
        ),
        join(owned.path, "android"),
        { NODE_ENV: options.configuration === "release" ? "production" : "development" },
      );
      produced = androidArtifact(owned.path, options.configuration);
    } else {
      await run(["pod", "install"], join(owned.path, "ios"), {
        LANG: environment.LANG ?? "en_US.UTF-8",
      });
      const project = iosProject(owned.path),
        configuration = options.configuration === "release" ? "Release" : "Debug";
      const derived = join(owned.parent, "derived-data");
      await run(
        [
          "xcodebuild",
          "-workspace",
          project.workspace,
          "-scheme",
          project.scheme,
          "-configuration",
          configuration,
          "-sdk",
          configuration === "Release" ? "iphoneos" : "iphonesimulator",
          "-destination",
          configuration === "Release" ? "generic/platform=iOS" : "generic/platform=iOS Simulator",
          "-derivedDataPath",
          derived,
          "CODE_SIGNING_ALLOWED=NO",
          "build",
        ],
        owned.path,
        { NODE_ENV: options.configuration === "release" ? "production" : "development" },
      );
      const products = join(
        derived,
        "Build/Products",
        `${configuration}-${configuration === "Release" ? "iphoneos" : "iphonesimulator"}`,
      );
      const apps = readdirSync(products).filter((name) => name.endsWith(".app"));
      if (apps.length !== 1) throw new Error("Xcode did not produce one native app.");
      produced = join(products, apps[0]);
      if (configuration === "Release") {
        const ats = await execute(
          [
            "/usr/libexec/PlistBuddy",
            "-c",
            "Print :NSAppTransportSecurity:NSAllowsArbitraryLoads",
            join(produced, "Info.plist"),
          ],
          { capture: true, signal },
        );
        if (ats.code !== 0 || ats.stdout.trim() !== "false")
          throw new Error("Release iOS must forbid arbitrary cleartext loads.");
      }
    }
    signal?.throwIfAborted();
    mkdirSync(dirname(artifact), { recursive: true });
    if (options.platform === "android") copyFileSync(produced, artifact);
    else cpSync(produced, artifact, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    failure = error;
  }
  try {
    cleanNativeProject(owned);
  } catch (cleanup) {
    if (failure)
      throw new AggregateError([failure, cleanup], "Native build and owned cleanup failed.");
    throw cleanup;
  }
  if (failure) {
    appendFileSync(logFile, `${redactNative(failure.message)}\n`);
    throw failure;
  }
  return { ...options, artifact };
}
async function main() {
  const options = buildOptions(process.argv.slice(2)),
    controller = new AbortController();
  const interrupt = () => controller.abort(130),
    terminate = () => controller.abort(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const result = await buildNative(options, { signal: controller.signal });
    console.log(`Native ${result.platform} ${result.configuration} artifact: ${result.artifact}`);
  } catch (error) {
    console.error(redactNative(error.message));
    process.exitCode = controller.signal.aborted ? controller.signal.reason : (error.exitCode ?? 1);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
