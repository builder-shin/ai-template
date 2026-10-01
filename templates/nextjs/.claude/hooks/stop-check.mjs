import { binary } from "../../scripts/process.mjs";
import { emit, loadState, output, projectRoot, readInput, saveState, snapshot } from "./common.mjs";

const input = readInput();
if (input.stop_hook_active !== true) {
  const root = projectRoot(input);
  const current = snapshot(root);
  const previous = loadState(root, input);
  const paths = [...new Set([...Object.keys(previous), ...Object.keys(current)])];
  const changed = paths.filter((path) => previous[path] !== current[path]);
  if (changed.length) {
    const result = binary("tsx", ["scripts/check/cli.ts", "--fast", "--", ...changed], {
      cwd: root,
    });
    if (result.status !== 0)
      emit({
        decision: "block",
        reason: `빠른 check가 실패했다. 고친 뒤 끝낸다.\n${output(result)}`,
      });
    else saveState(root, input, snapshot(root));
  }
}
