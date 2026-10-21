import { join, resolve, isAbsolute } from "node:path";
import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { nativeOptions, nativePlan } from "./plan.mjs";
import { preflightDevice, claimReverse } from "./device.mjs";
import { deviceAdapter } from "./device-adapter.mjs";
import { ensureMaestro, maestroCommand, javaExecutable, assertJavaVersion } from "./maestro.mjs";
import { executeOwned } from "./command.mjs";
import { buildNative } from "./build.mjs";
import { startNativeProxy, fixtureOrigin } from "./proxy.mjs";
import { startFixture } from "./fixture.mjs";
import { startService, metroCommand } from "./service.mjs";
import { prepareFlows } from "./flows.mjs";
import { cleanNativeProject } from "./owned.mjs";
import { contractRoot } from "../contract-root.mjs";
import { readPublicEnv } from "../../src/lib/config/env.ts";
import { redactNative } from "./redact.mjs";
import { maestroFailureLog, pickerHierarchy } from "./logs.mjs";
import { prepareWindowsMaestro } from "./windows.mjs";
import { verifyArtifactIdentity } from "./artifact.mjs";
import { startStorageProxy } from "./storage-proxy.mjs";
import { seedAndroidImage } from "./media.mjs";

export async function runNative(options, ports = {}) {
  const input = ports.env ?? process.env,
    execute = ports.execute ?? executeOwned,
    signal = ports.signal;
  const plan = nativePlan(options, input);
  if (options.keep || options.down)
    throw new Error("Stack --keep/--down belong to the root mobile-e2e runner.");
  if (options.print) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  const backend = options.target !== "mock";
  if (backend)
    for (const key of [
      "E2E_UPSTREAM_API_URL",
      "E2E_MAILPIT_URL",
      "E2E_OAUTH_URL",
      "E2E_STORAGE_UPSTREAM_URL",
    ])
      fixtureOrigin(input[key]);
  if (
    backend &&
    (!input.E2E_UPSTREAM_API_URL ||
      new URL(plan.env.EXPO_PUBLIC_API_BASE_URL).origin !== "http://127.0.0.1:4112")
  )
    throw new Error(
      "Backend native fixtures require E2E_UPSTREAM_API_URL and the owned API proxy on 127.0.0.1:4112.",
    );
  plan.listenPorts.push(backend ? 4112 : 4114);
  const adapter = ports.device ?? deviceAdapter(plan, { execute, env: input, signal });
  await preflightDevice(plan, adapter);
  const env = {
    ...input,
    ...plan.env,
    CI: "1",
    EXPO_NO_DOTENV: "1",
    EXPO_NO_TYPESCRIPT_SETUP: "1",
  };
  const java = javaExecutable(env),
    version = await execute([java, "-version"], { capture: true, signal });
  if (version.code !== 0) throw new Error("Native E2E needs Java 21.");
  assertJavaVersion(version.stdout + version.stderr);
  const installation = await ensureMaestro(undefined, { execute, signal });
  const log = join(plan.root, "artifacts/native", plan.runId, plan.platform, "e2e.log");
  if (existsSync(log)) throw new Error("Native E2E log already exists; choose another --run-id.");
  mkdirSync(resolve(log, ".."), { recursive: true });
  const cleanup = [],
    secrets = [];
  let failure, fixture, proxy;
  async function run(argv, extra = {}) {
    const result = await execute(argv, {
      cwd: plan.root,
      env,
      signal,
      secrets,
      output: (line) => {
        appendFileSync(log, line);
        process.stdout.write(line);
      },
      ...extra,
    });
    if (result.code !== 0)
      throw Object.assign(new Error(`Native E2E command failed (${result.code}).`), {
        exitCode: result.code,
      });
    return result;
  }
  const sdk = input.ANDROID_SDK_ROOT ?? input.ANDROID_HOME;
  const adb = sdk
    ? join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  const device = [adb, "-s", plan.deviceId];
  try {
    let artifact = input.E2E_NATIVE_ARTIFACT;
    if (artifact) {
      if (!isAbsolute(artifact) || !existsSync(artifact))
        throw new Error("Use an existing absolute E2E_NATIVE_ARTIFACT path.");
    } else
      artifact = (
        await buildNative(
          { platform: plan.platform, configuration: "debug", runId: plan.runId },
          { env, signal, execute },
        )
      ).artifact;
    await verifyArtifactIdentity(plan, artifact, { env, execute, signal });
    cleanup.push(await claimReverse(plan, adapter));
    const upstream = backend ? input.E2E_UPSTREAM_API_URL : "http://127.0.0.1:4114";
    if (!backend) {
      const mock = startService(
        [process.execPath, "--import", "tsx", join(contractRoot(plan.root), "mock/src/main.ts")],
        {
          cwd: plan.root,
          execute,
          signal,
          secrets,
          env: {
            ...env,
            PORT: "4114",
            HOST: "127.0.0.1",
            API_URL: "http://127.0.0.1:4112",
            MOCK_STORAGE_URL: "http://127.0.0.1:4116",
            REALTIME_ALLOWED_ORIGINS: "http://127.0.0.1:4112",
            FRONTEND_URL: env.EXPO_PUBLIC_FRONTEND_URL,
            MOCK_TEST_ENDPOINTS: "true",
            OAUTH_REDIRECT_URIS: `${env.EXPO_PUBLIC_APP_SCHEME}://oauth/callback`,
            RATE_LIMIT_GLOBAL: "1000000",
            RATE_LIMIT_LOGIN_IP: "1000000",
            RATE_LIMIT_LOGIN_IDENTIFIER: "1000000",
            RATE_LIMIT_REGISTRATION_IP: "1000000",
            RATE_LIMIT_MAIL_IP: "1000000",
            RATE_LIMIT_MAIL_EMAIL: "1000000",
          },
        },
      );
      cleanup.push((failed) => mock.stop(failed));
      await mock.ready(upstream + "/health/ready");
    }
    const storage = await startStorageProxy({
      upstream: backend ? input.E2E_STORAGE_UPSTREAM_URL : upstream,
      port: 4116,
    });
    cleanup.push(() => storage.stop());
    proxy = await startNativeProxy({
      upstream,
      port: 4112,
      intercept: (req, res) => fixture?.provider(req, res),
      observe: (event) =>
        appendFileSync(
          log,
          `API ${event.method} ${event.path.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, ":id")} ${event.status}\n`,
        ),
    });
    cleanup.push(() => proxy.stop());
    fixture = await startFixture({
      port: plan.bridgePort,
      api: upstream + "/api/v1",
      target: plan.target,
      proxy,
      storage,
      config: readPublicEnv(env, plan.platform, false),
      mailpit: input.E2E_MAILPIT_URL,
      providerOrigin: input.E2E_OAUTH_URL,
      metroOrigin: `http://127.0.0.1:${plan.metroPort}`,
      signal,
    });
    secrets.push(...fixture.secrets);
    cleanup.push(() => fixture.stop());
    if (plan.flows.includes("setup")) await fixture.seed();
    const metro = startService(metroCommand(plan.metroPort), {
      cwd: plan.root,
      env,
      execute,
      signal,
      secrets: fixture.secrets,
    });
    cleanup.push((failed) => metro.stop(failed));
    await metro.ready(`http://127.0.0.1:${plan.metroPort}/status`, async (response) =>
      (await response.text()).includes("packager-status:running"),
    );
    if (plan.platform === "android") await run([...device, "install", artifact]);
    else await run(["xcrun", "simctl", "install", plan.deviceId, artifact]);
    cleanup.push(async () => {
      // The initial inventory proved absence; installation above succeeded in this run.
      const argv =
        plan.platform === "android"
          ? [...device, "uninstall", plan.bundleId]
          : ["xcrun", "simctl", "uninstall", plan.deviceId, plan.bundleId];
      const result = await execute(argv, { capture: true, signal: AbortSignal.timeout(10000) });
      if (result.code !== 0) throw new Error("Owned native application cleanup failed.");
    });
    const flows = prepareFlows(plan, fixture);
    cleanup.push(() => cleanNativeProject(flows));
    if (plan.platform === "android")
      cleanup.push(
        await seedAndroidImage(plan, flows, {
          adb,
          execute,
          env,
          signal,
          record: join(resolve(log, ".."), "android-media.json"),
        }),
      );
    const windows = await prepareWindowsMaestro(java, flows, { execute, signal });
    const launch = `${env.EXPO_PUBLIC_APP_SCHEME}://expo-development-client/?url=${encodeURIComponent(`http://127.0.0.1:${plan.metroPort}`)}`;
    const launchCommand =
      plan.platform === "android"
        ? [
            ...device,
            "shell",
            "am",
            "start",
            "-W",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            launch,
            plan.bundleId,
          ]
        : ["xcrun", "simctl", "openurl", plan.deviceId, launch];
    await run(launchCommand, { capture: true });
    for (const flow of plan.flows) {
      try {
        const result = await run(
          maestroCommand(
            java,
            installation,
            [
              "--device",
              plan.deviceId,
              "--no-ansi",
              "test",
              "--test-output-dir",
              join(flows.parent, "raw-maestro", flow),
              "--debug-output",
              join(flows.parent, "raw-maestro", flow),
              join(flows.path, `${flow}.yaml`),
            ],
            windows,
          ),
          { env: { ...env, MAESTRO_CLI_NO_ANALYTICS: "1" }, secrets: fixture.secrets },
        );
        appendFileSync(log, `Native ${flow}: passed (${result.code}).\n`);
      } catch (error) {
        if (!signal?.aborted) {
          try {
            const hierarchy = await run(
              maestroCommand(
                java,
                installation,
                ["--device", plan.deviceId, "--no-ansi", "hierarchy", "--no-reinstall-driver"],
                windows,
              ),
              {
                capture: true,
                signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
              },
            );
            const diagnostic = pickerHierarchy(hierarchy.stdout) + "\n";
            appendFileSync(log, diagnostic);
            process.stdout.write(diagnostic);
          } catch {
            appendFileSync(log, "Picker hierarchy unavailable.\n");
          }
        }
        appendFileSync(log, maestroFailureLog(flows, flow, fixture.secrets));
        for (const event of fixture.diagnostics)
          appendFileSync(log, `Fixture ${JSON.stringify(event)}\n`);
        throw error;
      }
    }
  } catch (error) {
    failure = error;
  }
  const errors = [];
  for (const stop of cleanup.toReversed())
    try {
      await stop(!!failure);
    } catch (error) {
      errors.push(error);
    }
  if (errors.length)
    throw new AggregateError(
      [...(failure ? [failure] : []), ...errors],
      "Native E2E owned cleanup failed.",
    );
  if (failure) throw failure;
  return {
    flows: plan.flows.filter((flow) => flow !== "setup").length,
    focused: !!options.flow,
    log,
  };
}
async function main() {
  const controller = new AbortController(),
    interrupt = () => controller.abort(130),
    terminate = () => controller.abort(143);
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    const result = await runNative(nativeOptions(process.argv.slice(2)), {
      signal: controller.signal,
    });
    if (result)
      console.log(
        `${result.focused ? "Focused native" : "Native"} UI flows passed: ${result.flows}.`,
      );
  } catch (error) {
    console.error(redactNative(error.message));
    process.exitCode = controller.signal.aborted ? controller.signal.reason : (error.exitCode ?? 1);
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
