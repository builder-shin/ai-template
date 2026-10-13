import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { currentTraceId } from "./context.js";
export class JsonLogger extends ConsoleLogger {
  constructor(logLevels: LogLevel[] = ["log", "error", "warn", "debug", "verbose", "fatal"]) {
    super({ json: true, colors: false, compact: true, flattenParams: true, logLevels });
  }
  protected override stringifyJsonLogObject(logObject: Record<string, unknown>): string {
    return super.stringifyJsonLogObject({ ...logObject, traceId: currentTraceId() ?? null });
  }
}
