import { test } from "node:test";
import assert from "node:assert/strict";
import { stopNativeTree } from "./native/stop.mjs";
test("POSIX interruption signals the owned group with SIGINT then bounds escalation", async () => {
  const calls = [];
  let alive = true,
    clock = 0;
  await stopNativeTree(
    { pid: 321 },
    {
      platform: "linux",
      graceMs: 30,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      kill: (pid, signal) => {
        calls.push([pid, signal]);
        if (signal === "SIGKILL") alive = false;
        if (signal === 0 && !alive) throw Object.assign(new Error("Gone"), { code: "ESRCH" });
      },
    },
  );
  assert.deepEqual(
    calls.filter(([, signal]) => signal !== 0),
    [
      [-321, "SIGINT"],
      [-321, "SIGKILL"],
    ],
  );
  assert.ok(clock <= 2030);
});
test("Windows cleanup addresses only the captured child PID", async () => {
  const calls = [];
  await stopNativeTree(
    { pid: 321 },
    {
      platform: "win32",
      taskkill: (pid) => {
        calls.push(pid);
      },
      kill: () => {
        throw Object.assign(new Error("Gone"), { code: "ESRCH" });
      },
    },
  );
  assert.deepEqual(calls, [321]);
});
