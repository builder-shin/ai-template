import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { setup } from "./setup.mjs";
import { check } from "./check.mjs";
import { testE2e } from "./test-e2e.mjs";
import { frontendEnvironment, frontendE2e } from "./frontend-e2e.mjs";
import { fixture } from "../.claude/hooks/dispatch-fixture.mjs";

for (const [label, content] of [
  ["missing", undefined],
  ["malformed", "{"],
  ["null", "null"],
]) {
  test(`E2E 설정 ${label} 오류는 앱·파일·복구 안내와 함께 자식 실행 전에 거절한다`, (t) => {
    const f = fixture(t, ["api", "admin", "web"]);
    const path = "apps/web/app.config.json";
    if (content === undefined) rmSync(join(f.root, path));
    else f.write(path, content);
    const calls = [];
    assert.throws(
      () =>
        testE2e(f.root, (_command, args) => {
          calls.push(args);
          return { status: 0 };
        }),
      /web.*apps\/web\/app.config.json.* — .*ports.e2e/,
    );
    assert.deepEqual(calls, []);
  });
}

for (const port of [undefined, null, "3101", 0, -1, 65536, 3101.5]) {
  test(`E2E 포트 ${JSON.stringify(port)}는 백엔드 실행 전에 거절한다`, (t) => {
    const f = fixture(t, ["api", "admin", "web"]);
    f.write("apps/admin/app.config.json", JSON.stringify({ ports: { e2e: port } }));
    const calls = [];
    assert.throws(
      () =>
        testE2e(f.root, (_command, args) => {
          calls.push(args);
          return { status: 0 };
        }),
      /admin.*app.config.json.*ports.e2e/,
    );
    assert.deepEqual(calls, []);
  });
}

test("setup의 첫 프론트 실패 코드는 다음 프론트를 실행하지 않고 반환한다", (t) => {
  const f = fixture(t, ["api", "admin", "web"]);
  const calls = [];
  const code = setup(f.root, {
    nodeVersion: "24.19.0",
    run: (_command, args) => {
      calls.push(args);
      return { status: args.includes("admin") ? 17 : 0, stdout: "true\n" };
    },
  });
  assert.equal(code, 17);
  assert.deepEqual(calls.at(-1), ["--filter", "admin", "run", "setup"]);
  assert.equal(
    calls.some((args) => args.includes("web")),
    false,
  );
});

test("check는 Turbo의 첫 프론트 실패를 그대로 반환하며 후속 실행을 하지 않는다", (t) => {
  const f = fixture(t, ["api", "admin", "web"]);
  const calls = [];
  const messages = [];
  const code = check(f.root, {
    output: (message) => messages.push(message),
    run: (_command, args) => {
      calls.push(args);
      return args.includes("turbo") ? { status: 19, stderr: "admin failed" } : { status: 0 };
    },
  });
  assert.equal(code, 19);
  assert.deepEqual(calls.at(-1), [
    "exec",
    "turbo",
    "run",
    "check",
    "--filter=api",
    "--filter=admin",
    "--filter=web",
    "--concurrency=1",
  ]);
  assert.deepEqual(messages, ["admin failed"]);
});

test("E2E의 첫 프론트 실패는 다음 프론트 서버를 실행하지 않는다", (t) => {
  const f = fixture(t, ["api", "admin", "web"]);
  const calls = [];
  assert.equal(
    testE2e(f.root, (_command, args) => {
      calls.push(args);
      return { status: args.at(-1) === "admin" ? 23 : 0 };
    }),
    23,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls.at(-1).at(-1), "admin");
});

test("프론트 Origin 환경 누락은 프론트 프로세스를 실행하지 않는다", () => {
  const calls = [];
  assert.throws(
    () =>
      frontendE2e("/combo", "web", { E2E_API_URL: "http://127.0.0.1:18000" }, (_command, args) => {
        calls.push(args);
        return { status: 0 };
      }),
    /E2E_WEB_URL.* — /,
  );
  assert.deepEqual(calls, []);
});

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
