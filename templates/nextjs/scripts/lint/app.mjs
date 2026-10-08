import { architectureConfig } from "./boundaries.mjs";

/** web의 기능 폴더와 공개 인터페이스 규칙이다. */
export function appArchitectureConfig(root) {
  return architectureConfig(root, {
    serverFiles: /\/src\/features\/[^/]+\/(?:actions|queries)\.tsx?$/,
    elements: [{ type: "feature", pattern: "src/features/*", capture: ["name"] }],
    policies: [
      {
        disallow: { to: { element: { type: "feature", fileInternalPath: "!index.ts" } } },
        message: "다른 기능은 공개 index.ts로 가져온다.",
      },
      {
        dependency: { relationship: { to: "internal" } },
        allow: { to: { element: { type: "feature" } } },
      },
      {
        from: { element: { types: { anyOf: ["lib", "components"] } } },
        disallow: { to: { element: { types: { anyOf: ["feature", "app"] } } } },
        message: "공통 코드는 app이나 기능에 의존하지 않는다.",
      },
    ],
  });
}
