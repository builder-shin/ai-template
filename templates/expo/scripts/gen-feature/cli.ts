import { planFeature } from "./plan.ts";
import { writeFeature } from "./write.ts";
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("Usage: pnpm gen:feature <lower-kebab-name>");
  process.exitCode = 2;
} else {
  try {
    const edits = planFeature(process.cwd(), args[0]!);
    writeFeature(edits);
    console.log(
      `Created ${args[0]} (${edits.length} files). Review src/features/${args[0]}/README.md: API resource/types, permissions, fields, relationships, ko/en text, invalidation and backend/native E2E. Run pnpm check.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Feature generation failed.");
    process.exitCode = 2;
  }
}
