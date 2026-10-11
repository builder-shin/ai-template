import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { setup } from "./setup.mjs";
import { check } from "./check.mjs";
import { testE2e } from "./test-e2e.mjs";
import { frontendEnvironment, frontendE2e } from "./frontend-e2e.mjs";
import { fixture } from "../.claude/hooks/dispatch-fixture.mjs";

test("두 프론트 배치의 setup·check·E2E는 모두 실행하고 첫 프론트 실패에서 멈춘다", (t) => {
  const f = fixture(t, ["api", "web", "admin"]);
  const calls = [];
  const run = (_command, args) => {
    calls.push(args);
    return { status: 0, stdout: "true\n" };
  };
  assert.equal(setup(f.root, { run, nodeVersion: "24.19.0" }), 0);
  assert.deepEqual(calls.slice(-3), [
    ["--filter", "api", "run", "setup"],
    ["--filter", "admin", "run", "setup"],
    ["--filter", "web", "run", "setup"],
  ]);
  calls.length = 0;
  assert.equal(check(f.root, { run, output: () => undefined }), 0);
  assert.deepEqual(calls.at(-1).slice(4), [
    "--filter=api",
    "--filter=admin",
    "--filter=web",
    "--concurrency=1",
  ]);
  calls.length = 0;
  assert.equal(testE2e(f.root, run), 0);
  assert.equal(calls.length, 3);
  for (const [index, name, port] of [
    [1, "admin", 3101],
    [2, "web", 3100],
  ]) {
    assert.deepEqual(calls[index], [
      "--filter",
      "api",
      "run",
      "e2e:serve",
      "--web-url",
      `http://localhost:${port}`,
      "--",
      "node",
      join(f.root, "scripts/frontend-e2e.mjs"),
      name,
    ]);
  }
  calls.length = 0;
  assert.equal(
    testE2e(f.root, (_command, args) => {
      calls.push(args);
      return { status: args.includes("admin") ? 7 : 0 };
    }),
    7,
  );
  assert.equal(calls.length, 2);
});

test("admin E2E는 OAuth 없이 시드 변수를 요구하고 받은 대상 값을 유지한다", () => {
  const source = {
    E2E_API_URL: "http://127.0.0.1:18000",
    E2E_WEB_URL: "http://localhost:3101",
    E2E_MAILPIT_URL: "http://127.0.0.1:28025",
    E2E_RECENT_LOGIN_SECONDS: "10",
    E2E_SEED_ADMIN_EMAIL: "fixture@example.com",
    E2E_SEED_ADMIN_PASSWORD: "fixture-only", // betterleaks:allow 사유: 테스트 입력
  };
  const env = frontendEnvironment("admin", source);
  assert.equal(env.APP_URL, source.E2E_WEB_URL);
  assert.equal(env.E2E_SEED_ADMIN_EMAIL, source.E2E_SEED_ADMIN_EMAIL);
  assert.equal(env.E2E_SEED_ADMIN_PASSWORD, source.E2E_SEED_ADMIN_PASSWORD);
  for (const key of ["E2E_SEED_ADMIN_EMAIL", "E2E_SEED_ADMIN_PASSWORD"])
    assert.throws(
      () => frontendEnvironment("admin", { ...source, [key]: "" }),
      new RegExp(`${key}.* — `),
    );
  assert.equal(
    frontendE2e("/combo", "admin", source, (_command, args, options) => {
      assert.deepEqual(args, ["--filter", "admin", "run", "test:e2e"]);
      assert.equal(options.env.E2E_OAUTH_URL, undefined);
      return { status: 8 };
    }),
    8,
  );
});
