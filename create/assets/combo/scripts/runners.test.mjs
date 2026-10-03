import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setup } from "./setup.mjs";
import { check, instructionErrors } from "./check.mjs";
import { testE2e } from "./test-e2e.mjs";
import { webEnvironment, webE2e } from "./web-e2e.mjs";
import { stagedFormat } from "./staged-format.mjs";
import { run as runProcess } from "./process.mjs";
import { fixture, linkedRoot } from "../.claude/hooks/dispatch-fixture.mjs";

test("setup은 도구 확인·설치·api·web 순서이며 첫 실패에서 멈춘다", () => {
  const calls = [];
  const run = (command, args, options) => {
    calls.push([command, args, options.cwd]);
    return {
      status: args.includes("setup") ? 7 : 0,
      stdout: "",
      stderr: "",
    };
  };
  assert.equal(setup("/combo", { run, nodeVersion: "24.19.0", output: () => undefined }), 7);
  assert.deepEqual(
    calls.map(([, args]) => args),
    [
      ["--version"],
      ["--version"],
      ["--version"],
      ["install", "--frozen-lockfile"],
      ["rev-parse", "--show-cdup"],
      ["exec", "lefthook", "install"],
      ["--filter", "api", "run", "setup"],
    ],
  );
  assert.equal(setup("/combo", { run, nodeVersion: "22.0.0", output: () => undefined }), 1);
});

test("setup은 도구별 설치 안내를 쓰고 준비되면 web까지 실행한다", () => {
  for (const tool of ["pnpm", "uv", "docker"]) {
    const messages = [];
    assert.equal(
      setup("/combo", {
        nodeVersion: "24.19.0",
        output: (text) => messages.push(text),
        run: (command) => ({ status: command === tool ? 1 : 0 }),
      }),
      1,
    );
    assert.match(messages[0], /설치하고 PATH/);
    assert.match(messages[0], new RegExp(tool, "i"));
  }
  const args = [];
  assert.equal(
    setup("/combo", {
      nodeVersion: "24.19.0",
      run: (_command, values) => {
        args.push(values);
        return { status: 0, stdout: "" };
      },
    }),
    0,
  );
  assert.deepEqual(args.at(-1), ["--filter", "web", "run", "setup"]);
});

test("setup은 git 밖이나 상위 저장소 안이면 hook 설치만 건너뛰고 두 앱을 준비한다", () => {
  for (const git of [
    { status: 128, stderr: "not a git repository" },
    { status: 0, stdout: "../\n" },
  ]) {
    const calls = [];
    const messages = [];
    assert.equal(
      setup("/combo", {
        nodeVersion: "24.19.0",
        output: (message) => messages.push(message),
        run: (command, args) => {
          calls.push([command, args]);
          return command === "git" ? git : { status: 0 };
        },
      }),
      0,
    );
    assert.equal(
      calls.some(([, args]) => args.includes("lefthook")),
      false,
    );
    assert.deepEqual(calls.slice(-2), [
      ["pnpm", ["--filter", "api", "run", "setup"]],
      ["pnpm", ["--filter", "web", "run", "setup"]],
    ]);
    assert.match(messages.join("\n"), /설치.*건너.* — .*git init/);
  }
});

test("setup은 자기 저장소에만 hook을 설치하고 git 지정 환경을 지운다", () => {
  const variables = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_PREFIX",
  ];
  const previous = Object.fromEntries(variables.map((key) => [key, process.env[key]]));
  for (const key of variables) process.env[key] = "/unrelated";
  try {
    const calls = [];
    assert.equal(
      setup("/combo", {
        nodeVersion: "24.19.0",
        run: (command, args, options) => {
          calls.push({ command, args, options });
          return { status: 0, stdout: "" };
        },
      }),
      0,
    );
    const guarded = calls.filter(
      ({ command, args }) => command === "git" || args.includes("lefthook"),
    );
    assert.equal(guarded.length, 2);
    for (const { options } of guarded) {
      assert.equal(options.cwd, "/combo");
      for (const key of variables) assert.equal(options.env?.[key], undefined);
      assert.ok(options.env);
    }
  } finally {
    for (const key of variables) {
      if (previous[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previous[key];
    }
  }
});

for (const [name, rootPath] of [
  ["junction·symlink", (root, t) => linkedRoot(root, t)],
  ...(process.platform === "win32"
    ? [["소문자 드라이브", (root) => root[0].toLowerCase() + root.slice(1)]]
    : []),
]) {
  test(`setup은 ${name}로 연 자기 저장소에도 hook을 설치한다`, (t) => {
    const f = fixture(t);
    const root = rootPath(f.root, t);
    const calls = [];
    const messages = [];
    const code = setup(root, {
      nodeVersion: "24.19.0",
      output: (text) => messages.push(text),
      run: (command, args, options) => {
        if (command === "git") return runProcess(command, args, options);
        calls.push([command, args, options.cwd]);
        return { status: 0 };
      },
    });
    assert.equal(code, 0);
    assert.equal(
      calls.some(([, args]) => args.includes("lefthook")),
      true,
    );
    assert.equal(
      calls.every(([, , cwd]) => cwd === root),
      true,
    );
    assert.deepEqual(messages, []);
  });
}

test("E2E 실행기는 첫 실패를 전파하고 web 실행기의 절대 경로를 넘긴다", () => {
  const calls = [];
  const run = (_command, args, options) => {
    calls.push([args, options.cwd]);
    return { status: 0 };
  };
  assert.equal(testE2e(import.meta.dirname, run), 0);
  assert.deepEqual(calls[0][0], ["--filter", "api", "run", "test:e2e"]);
  assert.deepEqual(calls[1][0], [
    "--filter",
    "api",
    "run",
    "e2e:serve",
    "--",
    "node",
    join(import.meta.dirname, "scripts/web-e2e.mjs"),
  ]);
  assert.equal(
    testE2e(import.meta.dirname, () => ({ status: 9 })),
    9,
  );
});

test("백엔드 E2E 값만 web 대상 변수로 바꾸며 누락은 실행 전에 실패한다", () => {
  const source = {
    KEEP: "yes",
    E2E_API_URL: "http://127.0.0.1:18000",
    E2E_WEB_URL: "http://localhost:3100",
    E2E_MAILPIT_URL: "http://127.0.0.1:28025",
    E2E_OAUTH_URL: "http://127.0.0.1:28080",
    E2E_RECENT_LOGIN_SECONDS: "10",
  };
  const env = webEnvironment(source);
  assert.equal(env.E2E_TARGET, "fastapi");
  assert.equal(env.APP_URL, source.E2E_WEB_URL);
  assert.equal(env.API_BASE_URL, `${source.E2E_API_URL}/api/v1`);
  assert.equal(env.NEXT_PUBLIC_REALTIME_URL, source.E2E_API_URL);
  assert.equal(env.KEEP, "yes");
  for (const key of Object.keys(source).filter((key) => key.startsWith("E2E_"))) {
    assert.throws(() => webEnvironment({ ...source, [key]: "" }), /설정/);
  }
  assert.equal(
    webE2e("/combo", source, (_command, args, options) => {
      assert.deepEqual(args, ["--filter", "web", "run", "test:e2e"]);
      assert.deepEqual(options.env, env);
      return { status: 6 };
    }),
    6,
  );
});

test("check는 성공 한 줄 또는 실패한 단계만 출력하고 앱을 필터링한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-root-check-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "# 규칙\n");
    writeFileSync(join(root, "CLAUDE.md"), "@AGENTS.md\n");
    const output = [];
    const calls = [];
    const run = (_command, args) => {
      calls.push(args);
      return { status: 0, stdout: "숨김", stderr: "" };
    };
    assert.equal(check(root, { run, output: (text) => output.push(text) }), 0);
    assert.deepEqual(output, ["check 통과: 4단계"]);
    assert.deepEqual(calls.at(-1), [
      "exec",
      "turbo",
      "run",
      "check",
      "--filter=api",
      "--filter=web",
      "--concurrency=1",
    ]);
    output.length = 0;
    assert.equal(
      check(root, {
        run: () => ({ status: 3, stdout: "형식 오류", stderr: "" }),
        output: (text) => output.push(text),
      }),
      3,
    );
    assert.deepEqual(output, ["형식 오류"]);
    const rootCalls = [];
    assert.equal(
      check(root, {
        apps: false,
        run: (_command, args) => {
          rootCalls.push(args);
          return { status: 0 };
        },
        output: () => undefined,
      }),
      0,
    );
    assert.equal(
      rootCalls.some((args) => args.includes("turbo")),
      false,
    );
    assert.deepEqual(rootCalls.at(-1), [
      "--test",
      "scripts/*.test.mjs",
      ".claude/hooks/*.test.mjs",
    ]);
    writeFileSync(join(root, "AGENTS.md"), Array(202).fill("규칙").join("\n"));
    mkdirSync(join(root, "apps/api"), { recursive: true });
    writeFileSync(join(root, "apps/api/AGENTS.md"), "# api\n");
    assert.equal(instructionErrors(root).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("루트 staged 포맷은 앱·잠금 파일을 빼고 고친 루트 파일만 다시 스테이징한다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-root-format-"));
  try {
    writeFileSync(join(root, "README.md"), "# 루트\n");
    writeFileSync(join(root, "pnpm-lock.yaml"), "잠금\n");
    const files = ["README.md", "scripts/a.mjs", ".claude/hooks/x.mjs", ".github/workflows/ci.yml"];
    for (const path of files.slice(1)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "// fixture\n");
    }
    const calls = [];
    const result = stagedFormat(root, (command, args) => {
      calls.push([command, args]);
      return {
        status: 0,
        stdout:
          command === "git" && args[0] === "diff"
            ? `${files.join("\0")}\0apps/web/file.ts\0pnpm-lock.yaml\0`
            : "",
      };
    });
    assert.equal(result.status, 0);
    assert.deepEqual(calls[1], [
      "pnpm",
      ["exec", "prettier", "--write", "--ignore-unknown", ...files],
    ]);
    assert.deepEqual(calls[2], ["git", ["add", "--", ...files]]);
    assert.equal(stagedFormat(root, () => ({ status: 3 })).status, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("node로 직접 실행한 hook도 npm_execpath 없이 PATH의 pnpm JS를 돌린다", () => {
  const root = mkdtempSync(join(tmpdir(), "aitpl-pnpm-entry-"));
  try {
    mkdirSync(join(root, "node_modules/pnpm/bin"), { recursive: true });
    writeFileSync(
      join(root, "node_modules/pnpm/bin/pnpm.cjs"),
      "console.log(JSON.stringify(process.argv.slice(2)));\n",
    );
    const result = runProcess("pnpm", ["exec", "prettier", "파일 이름.md"], {
      env: { PATH: root },
    });
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), ["exec", "prettier", "파일 이름.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
