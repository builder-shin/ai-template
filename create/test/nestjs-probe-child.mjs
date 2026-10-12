import { writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
const required = [
  "E2E_API_URL",
  "E2E_WEB_URL",
  "E2E_MAILPIT_URL",
  "E2E_OAUTH_URL",
  "E2E_RECENT_LOGIN_SECONDS",
  "E2E_SEED_ADMIN_EMAIL",
  "E2E_SEED_ADMIN_PASSWORD",
];
for (const key of required) if (!process.env[key]?.trim()) throw Error("Missing " + key);
if (process.env.E2E_WEB_URL !== process.env.PROBE_EXPECTED_WEB_URL)
  throw Error("Origin forwarding");
if (process.env.E2E_API_URL !== "http://127.0.0.1:18000") throw Error("API forwarding");
const physicalTmp = realpathSync.native(tmpdir()),
  conservativePipeBytes = Buffer.byteLength(
    physicalTmp + "/tsx-" + String(process.getuid()) + "/2147483647.pipe",
  );
if (conservativePipeBytes >= 100) throw Error("TMP path");
const response = await fetch(process.env.E2E_API_URL + "/health/ready", {
  signal: AbortSignal.timeout(5000),
});
const body = await response.json();
if (response.status !== 200) throw Error("Readiness " + response.status);
const evidence = {
  scope: "actual generated API e2e:serve child, no frontend browser execution",
  utc: new Date().toISOString(),
  pid: process.pid,
  parentPID: process.ppid,
  nodeVersion: process.version,
  cwd: process.cwd(),
  physicalTmp,
  conservativePipeBytes,
  environment: {
    E2E_API_URL: process.env.E2E_API_URL,
    E2E_WEB_URL: process.env.E2E_WEB_URL,
    E2E_MAILPIT_URL: process.env.E2E_MAILPIT_URL,
    E2E_OAUTH_URL: process.env.E2E_OAUTH_URL,
    E2E_RECENT_LOGIN_SECONDS: process.env.E2E_RECENT_LOGIN_SECONDS,
    seedEmailPresent: true,
    seedPasswordPresent: true,
  },
  readiness: { status: response.status, body },
};
writeFileSync(process.env.PROBE_CHILD_EVIDENCE, JSON.stringify(evidence, null, 2) + "\n", {
  flag: "wx",
  mode: 0o444,
});
console.log(JSON.stringify({ generatedChild: evidence }));
