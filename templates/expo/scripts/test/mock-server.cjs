const { createServer } = require("node:net");
const { once } = require("node:events");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const { setTimeout: sleep } = require("node:timers/promises");
const { startProcessTree, stopProcessTree } = require("../process-tree.mjs");
const { contractRoot } = require("../contract-root.mjs");
const realFetch = fetch;

// The Jest host owns this child and networking; SDK module mocks never replace them.
exports.startMock = async function startMock(options = {}) {
  const quota = options.fileUserQuota ?? 1073741824;
  if (!Number.isSafeInteger(quota) || quota < 1 || quota > 1073741824)
    throw new Error("Invalid test storage quota.");
  const root = process.cwd();
  const listener = createServer().listen(0, "127.0.0.1");
  await once(listener, "listening");
  const { port } = listener.address();
  await new Promise((resolve) => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const localRequire = createRequire(join(root, "package.json"));
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/^(PORT|HOST|API_URL|FRONTEND_URL|MOCK_|SEED_|IDENTIFIER_|RATE_LIMIT_|OAUTH_|FILE_|REALTIME_|STORAGE_|RECENT_LOGIN)/i.test(
          key,
        ),
    ),
  );
  const child = startProcessTree(
    [
      "--import",
      pathToFileURL(localRequire.resolve("tsx")).href,
      join(contractRoot(root), "mock/src/main.ts"),
    ],
    {
      cwd: root,
      env: {
        ...inherited,
        EXPO_NO_DOTENV: "1",
        PORT: String(port),
        HOST: "127.0.0.1",
        API_URL: options.usePublicLocalhost ? base.replace("127.0.0.1", "localhost") : base,
        FRONTEND_URL: base,
        MOCK_TEST_ENDPOINTS: "true",
        ...(options.nativeScheme
          ? { OAUTH_REDIRECT_URIS: `${options.nativeScheme}://oauth/callback` }
          : {}),
        SEED_ADMIN_EMAIL: "admin@example.com",
        SEED_ADMIN_PASSWORD: "admin-password", // betterleaks:allow test seed
        IDENTIFIER_HASH_SECRET: "native-test-identifier-hash-secret-32", // betterleaks:allow test key
        RATE_LIMIT_GLOBAL: "10000",
        RATE_LIMIT_LOGIN_IP: "1000",
        RATE_LIMIT_LOGIN_IDENTIFIER: "1000",
        FILE_USER_QUOTA: String(quota),
        RATE_LIMIT_REGISTRATION_IP: "1000",
        RATE_LIMIT_MAIL_IP: "1000",
        RATE_LIMIT_MAIL_EMAIL: "1000",
      },
      stdio: "ignore",
    },
  );
  let startError;
  child.once("error", (error) => {
    startError = error;
  });
  let stopping;
  const stop = () => (stopping ??= stopProcessTree(child));
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (startError || child.exitCode !== null) throw new Error("Owned mock failed to start.");
      try {
        if ((await realFetch(`${base}/health/ready`, { signal: AbortSignal.timeout(500) })).ok)
          return { base, stop };
      } catch {
        /* Wait only for this owned server to become ready. */
      }
      await sleep(50);
    }
    throw new Error("Owned mock readiness timed out.");
  } catch (error) {
    await stop();
    throw error;
  }
};
