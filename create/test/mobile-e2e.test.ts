import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import { configureMobileDocs } from "../src/mobile-config.ts";
import { temporaryFolder, write } from "./helpers.ts";
interface Result {
  status: number | null;
}
type Execute = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    stdio: string;
    env?: NodeJS.ProcessEnv;
  },
) => Result;
async function fixture() {
  const root = temporaryFolder(),
    assets = resolve(import.meta.dirname, "../assets/combo");
  for (const name of ["apps.mjs", "process.mjs", "frontend-e2e.mjs", "test-e2e.mjs"])
    write(root, `scripts/${name}`, readFileSync(join(assets, "scripts", name), "utf8"));
  for (const name of ["mobile-command.mjs", "mobile-e2e.mjs"])
    write(root, `scripts/${name}`, readFileSync(join(assets, "mobile-only/scripts", name), "utf8"));
  for (const name of ["api", "mobile"]) write(root, `apps/${name}/package.json`, "{}\n");
  for (const name of ["README.md", "AGENTS.md"]) write(root, name, "Fixture\n");
  write(root, ".github/workflows/ci.yml", "jobs: {check: {steps: []}}\n");
  write(
    root,
    "native-ci.json",
    JSON.stringify({ check: { steps: [] }, android: { steps: [] }, ios: { steps: [] } }),
  );
  configureMobileDocs(root, ["mobile"]);
  return {
    root,
    frontend: (await import(pathToFileURL(join(root, "scripts/frontend-e2e.mjs")).href)) as {
      frontendE2e(root: string, app: string, source: NodeJS.ProcessEnv, execute: Execute): number;
    },
    aggregate: (await import(pathToFileURL(join(root, "scripts/test-e2e.mjs")).href)) as {
      testE2e(root: string, execute: Execute): number;
    },
  };
}
it.each(["fastapi", "nestjs"])(
  "generated aggregate reaches the actual native %s options and proxy topology",
  async (backend) => {
    vi.stubEnv("E2E_SKIP_MOBILE", undefined);
    const { root, frontend, aggregate } = await fixture(),
      calls: string[][] = [];
    const source = {
      E2E_MOBILE_PLATFORM: "android",
      E2E_MOBILE_DEVICE: "emulator-5554",
      E2E_MOBILE_BACKEND: backend,
      E2E_MOBILE_API_URL: "http://127.0.0.1:18102",
      E2E_MOBILE_STORAGE_URL: "http://127.0.0.1:28435",
      E2E_WEB_URL: "http://127.0.0.1:3112",
      E2E_MAILPIT_URL: "http://127.0.0.1:28127",
      E2E_OAUTH_URL: "http://127.0.0.1:28182",
      E2E_REVERSE_PORTS: "28435",
    };
    let nativeCalls = 0;
    const code = aggregate.testE2e(root, (_command, argv) => {
      calls.push(argv);
      if (argv.includes(join(root, "scripts/frontend-e2e.mjs"))) {
        return {
          status: frontend.frontendE2e(root, "mobile", source, (_cmd, args, options) => {
            nativeCalls++;
            // The root TS loader exercises the native validator without an Expo install/tsconfig.
            const moduleUrl = pathToFileURL(
              resolve(import.meta.dirname, "../../templates/expo/scripts/native/plan.mjs"),
            ).href;
            const checked = JSON.parse(
              execFileSync(
                process.execPath,
                [
                  "--import",
                  "tsx",
                  "--input-type=module",
                  "-e",
                  `import {readFileSync} from 'node:fs'; import {nativeOptions,nativePlan} from ${JSON.stringify(moduleUrl)};
const input=JSON.parse(readFileSync(0,'utf8')); const selected=nativeOptions(input.args);
console.log(JSON.stringify({selected,plan:nativePlan(selected,input.env)}));`,
                ],
                {
                  input: JSON.stringify({ args: args.slice(4), env: options.env }),
                  encoding: "utf8",
                  env: {
                    ...process.env,
                    TSX_TSCONFIG_PATH: resolve(import.meta.dirname, "../tsconfig.json"),
                  },
                },
              ),
            ) as {
              selected: { platform: string; deviceId: string; target: string };
              plan: { env: NodeJS.ProcessEnv };
            };
            const { selected, plan } = checked;
            expect(selected).toMatchObject({
              platform: "android",
              deviceId: "emulator-5554",
              target: backend,
            });
            expect(plan.env.EXPO_PUBLIC_API_BASE_URL).toBe("http://127.0.0.1:4112/api/v1");
            expect(options.env).toMatchObject({
              E2E_UPSTREAM_API_URL: source.E2E_MOBILE_API_URL,
              E2E_STORAGE_UPSTREAM_URL: source.E2E_MOBILE_STORAGE_URL,
              E2E_MAILPIT_URL: source.E2E_MAILPIT_URL,
              E2E_OAUTH_URL: source.E2E_OAUTH_URL,
              E2E_REVERSE_PORTS: "28435",
              EXPO_NO_DOTENV: "1",
            });
            return { status: 0 };
          }),
        };
      }
      return { status: 0 };
    });
    expect(code).toBe(0);
    expect(nativeCalls).toBe(1);
    expect(calls[0]).toEqual(["--filter", "api", "run", "test:e2e"]);
    expect(calls[1]).toEqual(["exec", "node", join(root, "scripts/frontend-e2e.mjs"), "mobile"]);
  },
);
it("rejects missing native device/provider configuration before child execution", async () => {
  const { root, frontend } = await fixture();
  expect(() =>
    frontend.frontendE2e(root, "mobile", {}, () => {
      throw new Error("Child must not start");
    }),
  ).toThrow(/E2E_MOBILE_PLATFORM/);
});
