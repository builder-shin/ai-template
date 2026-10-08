import { registerHooks } from "node:module";
// 선언을 읽는 검사 프로세스에서만 서버 전용 import 표식을 빈 모듈로 푼다.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only")
      return { url: new URL("./server-marker.mjs", import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
