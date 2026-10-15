import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { transformSync } from "@swc/core";
// 개발 worker와 scheduler도 빌드와 같은 Nest 생성자 메타데이터를 사용한다.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.endsWith(".js")) throw error;
      return next(specifier.slice(0, -3) + ".ts", context);
    }
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    const { code } = transformSync(readFileSync(new URL(url), "utf8"), {
      jsc: {
        target: "es2023",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: "es6" },
      sourceMaps: "inline",
      filename: new URL(url).pathname,
    });
    return { format: "module", shortCircuit: true, source: code };
  },
});
