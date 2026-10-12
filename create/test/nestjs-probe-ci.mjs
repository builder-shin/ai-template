import { existsSync, globSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse, parseAllDocuments } from "yaml";
import { isDeepStrictEqual } from "node:util";
import { verifyAppResolutions } from "../src/lockfile.ts";
import { materializePrototype } from "./nestjs-probe-materialization.ts";
import {
  immutable,
  measures,
  sha,
  closedPorts,
  assertNoCompose,
  cleanupVariant,
  removeOwnedFolders,
  frontendDifferences,
} from "./nestjs-probe-ci-support.mjs";

if (process.env.GITHUB_ACTIONS !== "true")
  throw Error("This four-variant runtime probe runs only in CI.");
const source = resolve(import.meta.dirname, "../.."),
  runnerTemp = resolve(process.env.RUNNER_TEMP);
const evidence = join(runnerTemp, "aitpl-nestjs-probe-evidence"),
  statePath = join(evidence, "state.json");
const mode = process.argv[2] ?? "run";
const publicEnvironment = {
  COMPOSE_DISABLE_ENV_FILE: "1",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:25432/app", // betterleaks:allow public CI credential
  REDIS_URL: "redis://127.0.0.1:26379/0",
  JWT_SECRET: "ci-probe-only-jwt-signing-key-at-least-32", // betterleaks:allow public CI credential
  IDENTIFIER_HASH_SECRET: "ci-probe-only-identifier-key-at-least-32", // betterleaks:allow public CI credential
  SMTP_URL: "smtp://127.0.0.1:21025",
  MAILPIT_URL: "http://127.0.0.1:28025",
  FRONTEND_URL: "http://localhost:3000",
  SEED_ADMIN_EMAIL: "ci-probe@example.com",
  SEED_ADMIN_PASSWORD: "ci-probe-admin-only-password-32", // betterleaks:allow public CI credential
  S3_ENDPOINT_URL: "http://127.0.0.1:28333",
  S3_PUBLIC_ENDPOINT_URL: "http://127.0.0.1:28333",
  S3_REGION: "us-east-1",
  S3_BUCKET: "app",
  S3_ACCESS_KEY_ID: "app",
  S3_SECRET_ACCESS_KEY: "app-secret", // betterleaks:allow public CI credential
  STORAGE_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
  REALTIME_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
  RATE_LIMIT_GLOBAL: "1000000",
  RATE_LIMIT_STRICT: "1000000",
  AI_AGENT: "1",
};
if (mode === "cleanup") {
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    if (state.runnerTemp !== runnerTemp) throw Error("Ownership root changed");
    const { run } = measures(join(evidence, "always-cleanup-commands"));
    for (const variant of state.variants) if (!variant.cleaned) cleanupVariant(run, variant);
    await closedPorts([18000, 25432, 26379, 28333, 21025, 28025, 28080]);
    removeOwnedFolders(state);
    immutable(join(evidence, "cleanup.json"), {
      utc: new Date().toISOString(),
      foldersAbsent: state.folders.every((p) => !existsSync(p)),
      variants: state.variants,
      portsClosed: true,
    });
    console.log(readFileSync(join(evidence, "cleanup.json"), "utf8"));
  }
} else if (mode === "run") {
  if (existsSync(evidence)) throw Error("Existing evidence directory");
  mkdirSync(evidence);
  const { run, rows } = measures(join(evidence, "run-commands"));
  const head = run("tested-head", "git", ["rev-parse", "HEAD"], { cwd: source }).stdout.trim();
  const clean = run("source-clean", "git", ["status", "--porcelain"], { cwd: source }).stdout;
  if (clean) throw Error("CI source is dirty");
  const clone = join(runnerTemp, "aitpl-probe-repo");
  if (existsSync(clone)) throw Error("Existing probe clone");
  const state = { runnerTemp, head, folders: [clone], variants: [] };
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  save();
  run("clone", "git", ["clone", "--no-hardlinks", source, clone]);
  run("checkout-tested", "git", ["checkout", "--detach", head], { cwd: clone });
  run("clone-frozen", "pnpm", ["install", "--frozen-lockfile"], { cwd: clone });
  for (const [key, value] of [
    ["user.name", "CI"],
    ["user.email", "ci@example.com"],
    ["commit.gpgsign", "false"],
  ])
    run("clone-identity", "git", ["config", key, value], { cwd: clone });
  const materialized = materializePrototype(clone, run);
  const materializationHead = run("clone-head", "git", ["rev-parse", "HEAD"], {
    cwd: clone,
  }).stdout.trim();
  immutable(join(evidence, "materialization.json"), {
    testedHead: head,
    materializationHead,
    sourceOnlyTracked: true,
    files: materialized,
  });
  const definitions = [
    ["standalone", []],
    ["web", ["web"]],
    ["admin", ["admin"]],
    ["both", ["web", "admin"]],
  ];
  const suffix = process.env.GITHUB_RUN_ID + "-" + process.env.GITHUB_RUN_ATTEMPT;
  for (const [id, frontends] of definitions) {
    const target = join(runnerTemp, "aitpl-nestjs-" + id);
    if (existsSync(target)) throw Error("Existing generation target");
    const name = "ci-nest-" + suffix + "-" + id;
    const api = frontends.length ? join(target, "apps/api") : target,
      image = name + (frontends.length ? "-api" : "-app");
    const variant = {
      id,
      name,
      target,
      api,
      image,
      frontends,
      composeOwned: false,
      imageOwned: false,
      cleaned: false,
      completed: false,
    };
    state.variants.push(variant);
    state.folders.push(target);
    save();
    const directory = join(evidence, id);
    mkdirSync(directory);
    const before = new Set(readdirSync(runnerTemp));
    try {
      run(
        id + "-generate",
        "pnpm",
        [
          "new",
          target,
          ...(frontends.length
            ? ["--api", "nestjs", ...frontends.map((f) => "--" + f)]
            : ["--template", "nestjs"]),
          "--name",
          name,
        ],
        { cwd: clone, env: publicEnvironment },
      );
    } finally {
      for (const file of readdirSync(runnerTemp))
        if (!before.has(file) && file.startsWith("aitpl-" + name + "-"))
          state.folders.push(join(runnerTemp, file));
      save();
    }
    const expectedTypeScript = frontends.length
      ? JSON.parse(
          readFileSync(
            join(
              clone,
              "templates",
              frontends[0] === "web" ? "nextjs" : "nextjs-admin",
              "package.json",
            ),
            "utf8",
          ),
        ).devDependencies.typescript
      : undefined;
    const originalSources = [
      { app: "api", path: join(clone, "templates/nestjs/pnpm-lock.yaml") },
      ...frontends.map((app) => ({
        app,
        path: join(clone, "templates", app === "web" ? "nextjs" : "nextjs-admin", "pnpm-lock.yaml"),
      })),
    ];
    function preserved(stage) {
      const combined = readFileSync(join(target, "pnpm-lock.yaml"), "utf8");
      for (const input of originalSources) {
        const original = readFileSync(input.path, "utf8");
        if (frontends.length)
          verifyAppResolutions(original, combined, input.app, expectedTypeScript);
        else if (
          !isDeepStrictEqual(
            parseAllDocuments(original).map((d) => d.toJS()),
            parseAllDocuments(combined).map((d) => d.toJS()),
          )
        )
          throw Error("Standalone resolutions changed");
      }
      const data = parseAllDocuments(combined).at(-1).toJS();
      const overlap = Object.fromEntries(
        [
          ["typescript", "6.0.3"],
          ["zod", "4.6.5"],
          ["@types/node", "24.13.6"],
          ["vitest", "5.0.1"],
          ["socket.io-client", "4.8.4"],
          ["@swc/core", "1.16.12"],
        ].map(([pkg, version]) => {
          const packages = Object.keys(data.packages).filter((k) => k.startsWith(pkg + "@"));
          const snapshots = Object.keys(data.snapshots).filter((k) => k.startsWith(pkg + "@"));
          if (packages.length !== 1 || packages[0] !== pkg + "@" + version)
            throw Error("Overlap version changed: " + pkg);
          return [
            pkg,
            {
              packageKeys: packages,
              snapshotKeys: snapshots,
              meaning:
                "one pinned package version; peer contexts retained, no physical-dedup claim",
            },
          ];
        }),
      );
      const workspace = parse(readFileSync(join(target, "pnpm-workspace.yaml"), "utf8"));
      if (workspace.minimumReleaseAge !== 1440) throw Error("Release-age policy changed");
      if (frontends.length && workspace.overrides?.typescript !== "6.0.3")
        throw Error("TypeScript override changed");
      immutable(join(directory, stage + "-resolutions.json"), {
        sourceApps: originalSources.map((s) => s.app),
        allSourceResolutionsPreserved: true,
        overlap,
        workspace,
        lockSHA256: sha(combined),
      });
    }
    preserved("generated");
    run(id + "-frozen", "pnpm", ["install", "--frozen-lockfile"], {
      cwd: target,
      env: publicEnvironment,
    });
    preserved("frozen");
    if (frontends.length) {
      const tests = globSync(["scripts/*.test.mjs", ".claude/hooks/*.test.mjs"], { cwd: target });
      run(id + "-root-node-tests", process.execPath, ["--test", ...tests], {
        cwd: target,
        env: publicEnvironment,
      });
      const dry = run(id + "-turbo-dry", "pnpm", ["exec", "turbo", "run", "check", "--dry=json"], {
        cwd: target,
        env: publicEnvironment,
      });
      immutable(join(directory, "turbo-dry.json"), JSON.parse(dry.stdout));
    }
    await closedPorts([18000, 25432, 26379, 28333, 21025, 28025, 28080]);
    assertNoCompose(run, api, name);
    variant.composeOwned = true;
    save();
    run(id + "-setup", "pnpm", ["run", "setup"], { cwd: target, env: publicEnvironment });
    preserved("setup");
    const apiArgs = frontends.length ? ["--filter", "api", "run"] : ["run"];
    run(id + "-api-check", "pnpm", [...apiArgs, "check"], { cwd: target, env: publicEnvironment });
    run(id + "-api-build", "pnpm", [...apiArgs, "build"], { cwd: target, env: publicEnvironment });
    const origin =
      "http://localhost:" +
      (!frontends.includes("web") && frontends.includes("admin") ? "3101" : "3100");
    run(
      id + "-e2e-child",
      "pnpm",
      [
        ...apiArgs,
        "e2e:serve",
        "--web-url",
        origin,
        "--",
        process.execPath,
        "--input-type=module",
        "-e",
        readFileSync(join(source, "create/test/nestjs-probe-child.mjs"), "utf8"),
      ],
      {
        cwd: target,
        env: {
          ...publicEnvironment,
          PROBE_EXPECTED_WEB_URL: origin,
          PROBE_CHILD_EVIDENCE: join(directory, "child.json"),
        },
      },
    );
    const processes = JSON.parse(readFileSync(join(api, ".cache/e2e/processes.json"), "utf8"));
    if (
      processes.code !== 0 ||
      processes.children.length !== 4 ||
      processes.children.some((p) => !p.gone || p.groupGone === false)
    )
      throw Error("Owned E2E process cleanup failed");
    await closedPorts([18000]);
    immutable(join(directory, "e2e-processes.json"), { ...processes, port18000Closed: true });
    const preexisting = run(id + "-image-preflight", "docker", ["image", "inspect", image], {
      allowFailure: true,
    });
    if (preexisting.row.nativeExit !== 1 || !/No such image/i.test(preexisting.stderr))
      throw Error("Existing image or inspection failure");
    variant.imageOwned = true;
    save();
    const context = frontends.length ? target : api;
    const buildArgs = frontends.length
      ? ["build", "--tag", image, "-f", "apps/api/Dockerfile", "."]
      : ["build", "--tag", image, "."];
    const build = run(id + "-image-build", "docker", buildArgs, {
      cwd: context,
      env: publicEnvironment,
    });
    const size = run(id + "-image-result", "docker", [
      "image",
      "inspect",
      image,
      "--format",
      "{{json .}}",
    ]).stdout;
    immutable(join(directory, "image.json"), {
      context: frontends.length ? "combo-root" : "standalone-app",
      buildNativeExit: build.row.nativeExit,
      image: JSON.parse(size),
    });
    frontendDifferences(clone, target, api, frontends, run, directory, id);
    const status = run(id + "-generated-clean", "git", ["status", "--porcelain"], {
      cwd: target,
    }).stdout;
    if (status) throw Error("Generated Git dirty: " + status);
    variant.completed = true;
    cleanupVariant(run, variant);
    save();
    await closedPorts([18000, 25432, 26379, 28333, 21025, 28025, 28080]);
    immutable(join(directory, "result.json"), {
      ...variant,
      generatedGitClean: true,
      sourceResolutionsPreservedAfterSetup: true,
      frontendFullCheck: false,
      frontendBrowserE2e: false,
    });
  }
  if (state.variants.length !== 4 || state.variants.some((v) => !v.completed || !v.cleaned))
    throw Error("Four variants incomplete");
  immutable(join(evidence, "result.json"), {
    testedHead: head,
    cloneOnlyMaterializationHead: materializationHead,
    variants: state.variants,
    commandRows: rows,
    allFourComplete: true,
    scope: "partial19/83 generation prototype; no full frontend check/browser or94-case acceptance",
  });
  console.log(readFileSync(join(evidence, "result.json"), "utf8"));
} else throw Error("Unknown CI probe mode");
