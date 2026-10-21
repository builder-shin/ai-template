import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "contract/**",
      "**/generated/**",
      "android/**",
      "ios/**",
      "dist/**",
      ".expo/**",
      "coverage/**",
      ".cache/**",
      "artifacts/**",
    ],
  },
  ...tseslint.configs.recommended,
  // Metro and Babel require CommonJS entry files.
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: 400 }],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10 },
      ],
    },
  },
  { files: ["**/*.test.{ts,tsx}"], rules: { "max-lines": ["error", { max: 600 }] } },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "boundaries/elements": [
        { type: "feature", pattern: "src/features/*", capture: ["feature"] },
        { type: "lib", pattern: "src/lib/**" },
        { type: "component", pattern: "src/components/**" },
        { type: "route", pattern: "src/app/**" },
      ],
      "import/resolver": { node: { extensions: [".ts", ".tsx", ".js"] } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              disallow: { to: { element: { type: "feature", fileInternalPath: "!index.ts" } } },
              message: "Import other features through index.ts.",
            },
            {
              dependency: { relationship: { to: "internal" } },
              allow: { to: { element: { type: "feature" } } },
            },
            {
              from: { element: { types: { anyOf: ["lib", "component"] } } },
              disallow: { to: { element: { types: { anyOf: ["feature", "route"] } } } },
              message: "Shared code cannot depend on routes/features.",
            },
          ],
        },
      ],
    },
  },
);
