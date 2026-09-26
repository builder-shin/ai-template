import { discoverSteps } from "./discover.ts";
import { formatReport, runSteps } from "./run-steps.ts";

const results = await runSteps(discoverSteps(process.cwd()));
console.log(formatReport(results));
process.exitCode = results.every((result) => result.ok) ? 0 : 1;
