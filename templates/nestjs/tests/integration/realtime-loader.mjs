import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { transformSync } from "@swc/core";
// 별도 시험 프로세스도 Nest 생성자 메타데이터를 보존해 주입한다.
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
    const source = transformSync(readFileSync(new URL(url), "utf8"), {
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: "es6" },
    }).code;
    return { format: "module", shortCircuit: true, source };
  },
});
