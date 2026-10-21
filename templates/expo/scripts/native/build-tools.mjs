import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assertJavaVersion, javaExecutable } from "./maestro.mjs";
import manifest from "./manifest.json" with { type: "json" };
import { parseDocument } from "yaml";
import { nativeProjectPath } from "./owned.mjs";
export function configureNativeInstall(owned, platform = process.platform) {
  const copy = nativeProjectPath(owned);
  if (platform !== "win32") return;
  // Windows CMake/Ninja probes still have short path limits despite long-path OS support.
  const file = join(copy, "pnpm-workspace.yaml"),
    doc = parseDocument(readFileSync(file, "utf8"));
  if (doc.errors.length) throw new Error("Invalid copied native workspace.");
  doc.set("virtualStoreDir", "node_modules/.v");
  doc.set("virtualStoreDirMaxLength", 32);
  doc.set("nodeLinker", "hoisted");
  writeFileSync(file, doc.toString({ lineWidth: 0 }));
}
export function nativeCmakeInit(owned, platform = process.platform) {
  nativeProjectPath(owned);
  if (platform !== "win32") return undefined;
  const file = join(owned.parent, "native-cmake.gradle");
  // Hash long object paths before the SDK's Windows Ninja reaches its path limit.
  writeFileSync(
    file,
    `gradle.beforeProject { p ->
  ['com.android.application', 'com.android.library'].each { id ->
    p.pluginManager.withPlugin(id) {
      p.extensions.getByName('androidComponents').finalizeDsl { android ->
        def args = android.defaultConfig.externalNativeBuild.cmake.arguments
        args.removeAll { value -> value.startsWith('-DCMAKE_OBJECT_PATH_MAX=') }
        args.add('-DCMAKE_OBJECT_PATH_MAX=250')
      }
    }
  }
}
`,
  );
  return file;
}

export async function buildTools(platform, input, execute, signal) {
  if (platform === "ios") {
    if (process.platform !== "darwin")
      throw new Error("iOS native compilation requires macOS and Xcode.");
    const version = await execute(["xcodebuild", "-version"], { capture: true, signal });
    const match = /Xcode (\d+)\.(\d+)/.exec(version.stdout);
    if (
      version.code !== 0 ||
      !match ||
      Number(match[1]) < 26 ||
      (Number(match[1]) === 26 && Number(match[2]) < 4)
    )
      throw new Error("Xcode 26.4 or newer is required by this Expo SDK.");
    if ((await execute(["pod", "--version"], { capture: true, signal })).code !== 0)
      throw new Error("CocoaPods is required; install it before building iOS.");
    return {};
  }
  const java = javaExecutable(input),
    version = await execute([java, "-version"], { capture: true, signal });
  if (version.code !== 0) throw new Error("Java 21 is required; configure JAVA_HOME.");
  assertJavaVersion(version.stdout + version.stderr);
  const sdk =
    input.ANDROID_SDK_ROOT ??
    input.ANDROID_HOME ??
    (process.platform === "win32" && input.LOCALAPPDATA
      ? join(input.LOCALAPPDATA, "Android/Sdk")
      : undefined);
  if (
    !sdk ||
    !["android-37.0", "android-37"].some((folder) =>
      existsSync(join(sdk, "platforms", folder, "android.jar")),
    )
  )
    throw new Error(
      "Android SDK platform 37 is required; configure ANDROID_HOME and install its platform/build tools.",
    );
  return { java, ANDROID_HOME: resolve(sdk), ANDROID_SDK_ROOT: resolve(sdk) };
}
export function gradleCommand(java, copy, configuration, input, init) {
  const architectures =
    input.NATIVE_ANDROID_ARCHITECTURES ??
    (configuration === "release" ? "arm64-v8a" : "arm64-v8a,x86_64");
  if (!architectures.split(",").every((value) => ["arm64-v8a", "x86_64"].includes(value)))
    throw new Error("Use arm64-v8a,x86_64 native Android architectures.");
  return [
    java,
    "-classpath",
    join(copy, "android/gradle/wrapper/gradle-wrapper.jar"),
    "org.gradle.wrapper.GradleWrapperMain",
    "--no-daemon",
    "--max-workers=2",
    ...(init ? ["--init-script", init] : []),
    "-Dorg.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g",
    `-Pandroid.compileSdkVersion=${manifest.android.compileSdk}`,
    `-PreactNativeArchitectures=${architectures}`,
    configuration === "release" ? "assembleRelease" : "assembleDebug",
  ];
}
export function androidArtifact(copy, configuration) {
  const folder = join(copy, "android/app/build/outputs/apk", configuration);
  const path = [
    join(folder, `app-${configuration}.apk`),
    join(folder, "app-release-unsigned.apk"),
  ].find(existsSync);
  if (!path) throw new Error("Gradle did not produce the requested native APK.");
  if (configuration === "release") {
    const base = join(copy, "android/app/build/intermediates/merged_manifests");
    const candidates = readdirSync(base, { recursive: true }).filter(
      (name) => name.endsWith("AndroidManifest.xml") && name.split(/[\\/]/).includes("release"),
    );
    if (
      !candidates.length ||
      candidates.some(
        (name) =>
          !/android:usesCleartextTraffic="false"/.test(readFileSync(join(base, name), "utf8")),
      )
    )
      throw new Error("The merged release manifest must explicitly forbid cleartext traffic.");
  }
  return path;
}
export function iosProject(copy) {
  const projects = readdirSync(join(copy, "ios")).filter((name) => name.endsWith(".xcworkspace"));
  if (projects.length !== 1) throw new Error("CNG must produce exactly one iOS workspace.");
  return {
    workspace: join(copy, "ios", projects[0]),
    scheme: projects[0].replace(/\.xcworkspace$/, ""),
  };
}
