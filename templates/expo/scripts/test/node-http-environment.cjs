const { dirname, join } = require("node:path");
const NativeEnvironment = require(
  join(dirname(require.resolve("jest-expo/package.json")), "src/preset/nativeEnvironment.js"),
);

// SDK mocks install a native fetch implementation without a native networking module.
// Preserve Node's real networking classes for actual HTTP tests only; UI tests retain SDK mocks.
const nodeHttp = { fetch, Request, Response, Headers, AbortController, AbortSignal };
module.exports = class NodeHttpEnvironment extends NativeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.global.__nodeHttp = nodeHttp;
  }
};
