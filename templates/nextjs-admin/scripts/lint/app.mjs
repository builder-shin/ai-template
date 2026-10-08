import { architectureConfig } from "./boundaries.mjs";

/** 관리 서버 모듈과 기반·화면 계층의 방향을 검사한다. */
export function appArchitectureConfig(root) {
  return architectureConfig(root, {
    serverFiles: /\/src\/lib\/admin\/(?:actions|account)\.tsx?$/,
    policies: [
      {
        from: { element: { types: { anyOf: ["lib", "components"] } } },
        disallow: { to: { element: { type: "app" } } },
        message: "기반과 컴포넌트는 app에 의존하지 않는다.",
      },
    ],
  });
}
