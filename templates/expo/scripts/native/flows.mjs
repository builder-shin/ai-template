import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prepareNativeProject, nativeProjectPath } from "./owned.mjs";
import { fixtureImage } from "./fixture.mjs";
export { nativeFlows } from "./flow-names.mjs";
export function prepareFlows(plan, fixture) {
  const owned = prepareNativeProject(join(plan.root, "e2e"));
  const path = nativeProjectPath(owned);
  for (const name of readdirSync(path, { recursive: true }).filter((name) =>
    name.endsWith(".yaml"),
  )) {
    const file = join(path, name);
    writeFileSync(
      file,
      readFileSync(file, "utf8")
        .replaceAll("__BUNDLE_ID__", plan.bundleId)
        .replaceAll("__DEV_CLIENT_URL__", plan.devClientUrl),
    );
  }
  writeFileSync(
    join(path, "bridge.js"),
    `var response = http.get(${JSON.stringify(fixture.url)} + '/' + ACTION);
if (!response.ok) throw new Error('Owned native fixture assertion failed');
if (ACTION === 'data') output.data = json(response.body);
else output.result = json(response.body);
`,
  );
  writeFileSync(join(path, "native.png"), fixtureImage);
  mkdirSync(join(owned.parent, "raw-maestro"));
  return owned;
}
