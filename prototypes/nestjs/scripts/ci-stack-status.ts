import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const args = ["compose", "-f", "compose.yaml", "--profile", "app"];
const up = spawnSync("docker", [...args, "up", "-d", "--wait", "--wait-timeout", "180"], {
  stdio: "inherit",
});
assert.equal(up.status, 0);
const ps = spawnSync("docker", [...args, "ps", "--all", "--format", "json"], { encoding: "utf8" });
assert.equal(ps.status, 0);
interface Service {
  Service: string;
  State: string;
  Health: string;
  ExitCode: number;
}
const raw = ps.stdout.trim();
const services = (
  raw.startsWith("[")
    ? (JSON.parse(raw) as unknown)
    : raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown)
) as Service[];
for (const name of ["migrate", "storage-init"]) {
  const service = services.find((s) => s.Service === name);
  assert(service);
  assert.equal(service.State, "exited");
  assert.equal(service.ExitCode, 0);
}
assert.equal(services.find((s) => s.Service === "api")?.Health, "healthy");
for (const name of ["worker", "scheduler"])
  assert.equal(services.find((s) => s.Service === name)?.State, "running");
const evidence = {
  observedAt: new Date().toISOString(),
  services: services.map(({ Service, State, Health, ExitCode }) => ({
    Service,
    State,
    Health,
    ExitCode,
  })),
};
mkdirSync(".cache/stack", { recursive: true });
writeFileSync(".cache/stack/compose-status.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ composeStatus: evidence }));
