import { emit } from "./common.mjs";
emit({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext:
      "Use AGENTS.md. Native SDKs are platform-specific; pnpm check verifies JS and generated contract without starting infrastructure. Use explicit public endpoints; never read .env.",
  },
});
