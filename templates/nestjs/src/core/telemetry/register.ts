import { loadSettings } from "../config/settings.js";
import { startTelemetry } from "./sdk.js";
export { ignoreIncoming } from "./tracer.js";
const sdk = startTelemetry(loadSettings());
if (sdk) {
  const shutdown = () => {
    void sdk.shutdown().catch(() => {
      process.stderr.write("계측 종료에 실패했다\n");
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("beforeExit", shutdown);
}
