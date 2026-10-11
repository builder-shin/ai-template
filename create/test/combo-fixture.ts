import { chmodSync } from "node:fs";
import { join } from "node:path";
import { copyComboAssets, fixtureRepository, git, write } from "./helpers.ts";

export const lock =
  "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies: {}\n---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      react: {specifier: 19.3.0, version: 19.3.0}\n  contract/mock:\n    dependencies:\n      hono: {specifier: 4.0.0, version: 4.0.0}\npackages:\n  react@19.3.0: {resolution: {integrity: fixture}}\nsnapshots:\n  react@19.3.0: {}\n";

export function comboFixture() {
  const root = fixtureRepository();
  write(root, "templates/nextjs/pnpm-lock.yaml", lock);
  write(
    root,
    "templates/nextjs/pnpm-workspace.yaml",
    "packages:\n  - contract/*\nminimumReleaseAge: 1440\nallowBuilds:\n  lefthook: false\n",
  );
  write(
    root,
    "templates/nextjs/package.json",
    JSON.stringify({
      name: "nextjs-template",
      engines: { node: ">=24 <25" },
      devDependencies: {
        lefthook: "2.1.14",
        prettier: "3.9.9",
        typescript: "6.0.3",
        "@types/node": "24.13.6",
        vitest: "5.0.1",
        yaml: "2.9.1",
      },
    }),
  );
  write(
    root,
    "templates/nextjs/.env.example",
    "# 주소\nAPI_BASE_URL=http://localhost:4010/api/v1 # API\nNEXT_PUBLIC_REALTIME_URL=http://localhost:4010\n",
  );
  write(root, "templates/nextjs/.prettierrc.json", "{}\n");
  write(root, "templates/nextjs/tsconfig.base.json", '{"compilerOptions":{"strict":true}}\n');
  write(root, "templates/nextjs/docs/conventions/error-codes.md", "# 에러 코드\n");
  write(root, "templates/nextjs/contract/typespec/main.tsp", "model Item {}\n");
  write(root, "templates/nextjs/contract/openapi.yaml", "openapi: 3.1.0\n");
  write(root, "templates/nextjs/contract/mock/src/generated/api.ts", "export type Item = {};\n");
  write(root, "templates/nextjs/contract/mock/bin/start.sh", "#!/bin/sh\necho mock\n");
  write(root, "templates/nextjs/contract/untracked.txt", "복사 금지\n");
  write(root, "templates/nextjs/Dockerfile", "# 단독 web 이미지\nCOPY pnpm-lock.yaml ./\n");
  write(root, "templates/nextjs/.github/workflows/ci.yml", "name: web\n");
  write(root, "templates/fastapi/.github/workflows/ci.yml", "name: api\n");
  write(root, "templates/fastapi/openapi.json", "{}\n");
  for (const template of ["fastapi", "nextjs"]) {
    write(
      root,
      `templates/${template}/.claude/settings.json`,
      '{"permissions":{"allow":[],"deny":[]}}\n',
    );
    write(root, `templates/${template}/lefthook.yml`, "pre-commit:\n  jobs: []\n");
    write(root, `templates/${template}/.betterleaks.toml`, "[extend]\nuseDefault = true\n");
  }
  write(
    root,
    "templates/nextjs/.mcp.json",
    '{"mcpServers":{"next-devtools":{"command":"npx","args":["--yes","next-devtools-mcp@0.4.0"]}}}\n',
  );
  write(root, ".gitattributes", "* text=auto eol=lf\n");
  write(root, ".editorconfig", "root = true\n");
  copyComboAssets(root);
  if (process.platform !== "win32")
    chmodSync(join(root, "templates/nextjs/contract/mock/bin/start.sh"), 0o755);
  git(root, "add", ".");
  git(root, "reset", "--", "templates/nextjs/contract/untracked.txt");
  git(root, "update-index", "--chmod=+x", "templates/nextjs/contract/mock/bin/start.sh");
  git(root, "-c", "commit.gpgsign=false", "commit", "-m", "chore: combo fixture");
  return root;
}
