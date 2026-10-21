export const stages = [
  { name: "format", argv: ["exec", "prettier", "--check", "."] },
  { name: "lint", argv: ["exec", "eslint", "."] },
  { name: "types", argv: ["exec", "tsc", "--noEmit"] },
  { name: "test", argv: ["test", "--runInBand"] },
  { name: "node", argv: ["test:node"] },
  { name: "generated", argv: ["check:generated"] },
  { name: "harness", argv: ["exec", "tsx", "scripts/check/harness.ts"] },
] as const;
