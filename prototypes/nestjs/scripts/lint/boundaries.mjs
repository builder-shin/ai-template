import boundaries from "eslint-plugin-boundaries";
import prototype from "./rules.mjs";
import { commentProcessor } from "./rules.mjs";

const layers = [
  "controller",
  "operations",
  "schemas",
  "service",
  "repository",
  "policies",
  "events",
  "jobs",
];
const modules = ["health", "roles", "users", "auth", "files", "realtime", "posts"];
const dag = { users: ["roles"], auth: ["users"], realtime: ["auth"], posts: ["users", "files"] };
const element = (type, module) => ({
  element: { type, ...(module ? { captured: { module } } : {}) },
});
const types = (values) => ({ element: { types: { anyOf: values } } });

/** @param {string} root @returns {import("eslint").Linter.Config} */
export function architectureConfig(root) {
  const policies = [
    {
      from: types(["scripts", "tests", "assembly"]),
      allow: { to: { element: { isUnknown: false } } },
    },
    { to: element("core"), allow: { from: { element: { isUnknown: false } } } },
  ];
  for (const module of modules) {
    const directions = {
      index: ["index", ...layers],
      controller: ["service", "operations", "schemas"],
      service: ["repository", "operations", "schemas", "policies", "events", "jobs"],
      operations: ["schemas"],
      policies: ["schemas"],
      events: ["schemas"],
      jobs: ["service"],
    };
    for (const [from, targets] of Object.entries(directions)) {
      policies.push({
        from: element(`module-${from}`, module),
        allow: targets.map((to) => ({ to: element(`module-${to}`, module) })),
      });
    }
    for (const dependency of dag[module] ?? []) {
      policies.push({
        from: { element: { captured: { module } } },
        allow: { to: element("module-index", dependency) },
      });
    }
  }
  policies.push(
    {
      to: element("generated-prisma"),
      disallow: { from: { element: { isUnknown: false } } },
      message: "생성 Prisma 클라이언트의 직접 참조다. 대신 repository 또는 core/db를 사용하라.",
    },
    { from: element("module-repository"), allow: { to: element("generated-prisma") } },
    {
      from: { element: { type: "core", fileInternalPath: "db/**" } },
      allow: { to: element("generated-prisma") },
    },
    // *.module.ts는 같은 모듈의 조립 계층이며 외부에는 index.ts만 공개한다.
    {
      to: { element: { type: "module-index", path: "**/*.module.ts" } },
      disallow: { from: { element: { types: { anyOf: ["assembly"] } } } },
      message: "모듈 조립 내부 참조다. 대신 modules/<이름>/index.ts를 사용하라.",
    },
  );
  policies.push({
    from: element("assembly"),
    disallow: { to: types(layers.map((layer) => `module-${layer}`)) },
    message: "모듈 내부 참조다. 대신 modules/<이름>/index.ts를 사용하라.",
  });
  for (const module of modules) {
    policies.push({
      from: { element: { captured: { module } } },
      disallow: { to: { element: { captured: { module: `!${module}` }, path: "**/*.module.ts" } } },
      message: "다른 모듈의 조립 내부 참조다. 대신 공개 index.ts를 사용하라.",
    });
  }
  return {
    files: ["src/**/*.ts", "scripts/**/*.{ts,mjs}", "test/**/*.ts"],
    plugins: { boundaries, prototype },
    processor: commentProcessor(),
    settings: {
      "boundaries/root-path": root,
      "boundaries/elements": [
        { type: "generated-prisma", pattern: "src/generated/prisma/**", mode: "file" },
        { type: "core", pattern: "src/core/**", mode: "file" },
        ...["index.ts", "*.module.ts"].map((file) => ({
          type: "module-index",
          pattern: `src/modules/*/${file}`,
          capture: ["module"],
          mode: "file",
        })),
        ...layers.flatMap((layer) =>
          [layer, `*.${layer}`].map((file) => ({
            type: `module-${layer}`,
            pattern: `src/modules/*/${file}.ts`,
            capture: ["module"],
            mode: "file",
          })),
        ),
        {
          type: "module-policies",
          pattern: "src/modules/*/permissions.ts",
          capture: ["module"],
          mode: "file",
        },
        ...["main", "app.module", "worker", "scheduler", "seed"].map((file) => ({
          type: "assembly",
          pattern: `src/${file}.ts`,
          mode: "file",
        })),
        { type: "scripts", pattern: "scripts/**" },
        { type: "tests", pattern: "test/**" },
      ],
      "import/resolver": { typescript: { project: `${root}/tsconfig.json` } },
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/no-unknown-dependencies": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkInternals: true,
          message:
            "금지된 모듈·계층 의존이다. 대신 공개 index.ts와 controller → service → repository 방향 및 승인된 DAG를 사용하라.",
          policies,
        },
      ],
      "prototype/unsafe-sql": "error",
      "prototype/suppression-reason": "error",
    },
  };
}
