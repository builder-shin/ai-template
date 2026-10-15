import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const script = pathToFileURL(resolve("scripts/e2e-serve.ts")).href;
const moduleUrl = (source) => "data:text/javascript," + encodeURIComponent(source);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "node:child_process")
      return {
        url: moduleUrl(`
      import { EventEmitter } from 'node:events';
      export function spawn() { const child = new EventEmitter(); queueMicrotask(() => child.emit('exit', 0)); return child; }
      export function spawnSync() { throw new Error('실제 도구는 실행하지 않는다'); }
      export function execFileSync() { throw new Error('실제 도구는 실행하지 않는다'); }
    `),
        shortCircuit: true,
      };
    if (specifier === "./e2e-serve.js" && context.parentURL?.endsWith("/scripts/test-e2e.ts"))
      return {
        url: moduleUrl(
          `import { realDeps } from ${JSON.stringify(script)}; export async function runE2eServe() { await realDeps.prepare({}); return 0; }`,
        ),
        shortCircuit: true,
      };
    if (specifier === "./e2e-prepare.js")
      return {
        url: moduleUrl(
          "export async function prepareE2e() { process.stdout.write('준비가 끝났다'); }",
        ),
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
