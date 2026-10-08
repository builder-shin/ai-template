import { architectureConfig } from "./boundaries.mjs";

/** 관리 서버 모듈과 기반·화면 계층의 방향을 검사한다. */
export function appArchitectureConfig(root) {
  return architectureConfig(root, {
    serverFiles:
      /\/src\/(?:lib\/admin\/(?:actions|account)\.tsx?$|lib\/resources\/|resources\/[^/]+\/actions\.tsx?$)/,
    elements: [
      { type: "resource", pattern: "src/resources/*", capture: ["name"] },
      { type: "registry", pattern: "src/resources" },
    ],
    policies: [
      {
        from: { element: { type: "app" } },
        disallow: { to: { element: { type: "registry", fileInternalPath: "!index.ts" } } },
        message: "화면은 resources/index.ts에서 등록 목록을 가져온다.",
      },
      {
        from: { element: { type: "app" } },
        disallow: { to: { element: { type: "messages" } } },
        message: "화면 문구는 i18n 도우미로 읽는다.",
      },
      {
        from: { element: { types: { anyOf: ["app", "lib", "components", "resource"] } } },
        disallow: { to: { element: { type: "resource" } } },
        message: "리소스 내부는 등록 목록에서만 가져온다.",
      },
      {
        dependency: { relationship: { to: "internal" } },
        allow: { to: { element: { type: "resource" } } },
      },
      {
        from: { element: { types: { anyOf: ["lib", "components"] } } },
        disallow: { to: { element: { type: "app" } } },
        message: "기반과 컴포넌트는 app에 의존하지 않는다.",
      },
    ],
  });
}
