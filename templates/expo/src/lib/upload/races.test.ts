/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createUploader } from "./core";
import { createApiClient } from "../api/client";
import { nodeApiFetch } from "../testing/api-fetch";
import { readPublicEnv } from "../config/env";
import { SessionManager } from "../session/manager";
import { deferred, memoryStore, passwordGrant, tokens } from "../session/test-fixtures";
import { installNodeHttp } from "../testing/native-http";
import { ApiError } from "../api/errors";
import type { FileResource, PickedFile } from "./types";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
installNodeHttp();
type Mode =
  | "hold"
  | "incomplete"
  | "pending"
  | "badType"
  | "badAuthHeader"
  | "badUrl"
  | "disconnect"
  | "expired"
  | "normal";
let server: Server;
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function harness(mode: Mode, release = false) {
  const entered = deferred<void>();
  const transferred: { path: string; auth: string | undefined }[] = [];
  let deletes = 0,
    grants = 0,
    base = "";
  const id = "319c4505-7fe0-4a98-87de-7a1a5d2f5caf";
  const file: FileResource = {
    type: "files",
    id,
    attributes: {
      filename: "image.png",
      contentType: "image/png",
      size: 8,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
    relationships: {
      owner: { data: { type: "users", id: "65a91ac7-1d58-4f42-ac44-fa5300c59417" } },
    },
  };
  server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/vnd.api+json");
    if (request.method === "POST") {
      if (mode === "expired") {
        response.writeHead(401);
        response.end(JSON.stringify({ errors: [{ code: "auth.unauthenticated" }] }));
        return;
      }
      const upload = {
        url: `${base}${mode === "badUrl" ? String.fromCharCode(92) : "/"}storage/object?signature=opaque%2Fquery&part=1`,
        method: "PUT",
        headers: {
          "Content-Type": "image/png",
          ...(mode === "badAuthHeader" ? { Authorization: "not-a-storage-credential" } : {}),
        },
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
      response.writeHead(201);
      response.end(JSON.stringify({ data: { ...file, meta: { upload } } }));
    } else if (request.method === "PUT") {
      for await (const chunk of request) void chunk;
      transferred.push({ path: request.url!, auth: request.headers.authorization });
      entered.resolve();
      if (mode === "hold") return;
      if (mode === "disconnect") {
        response.destroy();
        return;
      }
      response.writeHead(200);
      response.end();
    } else if (request.method === "PATCH") {
      if (mode === "incomplete") {
        response.writeHead(422);
        response.end(JSON.stringify({ errors: [{ code: "file.upload_incomplete" }] }));
        return;
      }
      response.end(
        JSON.stringify({
          data: {
            ...file,
            type: mode === "badType" ? "posts" : "files",
            attributes: { ...file.attributes, status: mode === "pending" ? "pending" : "ready" },
          },
        }),
      );
    } else {
      deletes++;
      response.writeHead(204);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No owned test address.");
  base = `http://127.0.0.1:${address.port}`;
  const manager = new SessionManager({
    store: memoryStore(),
    transport: {
      grant: async () => {
        if (mode === "expired" && grants) throw new ApiError(401);
        return tokens(++grants === 1 ? "first" : "second");
      },
      revoke: async () => {},
    },
  });
  await manager.signIn(passwordGrant);
  const api = createApiClient(
    readPublicEnv({ EXPO_PUBLIC_API_BASE_URL: `${base}/api/v1` }, "ios", false),
    manager,
    undefined,
    nodeApiFetch,
  );
  const uploader = createUploader({
    api,
    session: manager,
    release,
    prepare: async () => ({ body: new Uint8Array(8), size: 8 }),
    put: (url, input) => fetch(url, input),
  });
  const picked: PickedFile = {
    uri: "file:///cache/image.png",
    name: "image.png",
    mimeType: "image/png",
    size: 8,
  };
  return { entered, manager, uploader, picked, transferred, deletes: () => deletes };
}
test("caller abort cancels PUT and removes pending metadata within the same session", async () => {
  const scope = await harness("hold"),
    controller = new AbortController();
  const result = scope.uploader.uploadFile(scope.picked, { signal: controller.signal });
  await scope.entered.promise;
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(scope.deletes()).toBe(1);
});
test("logout during PUT cannot attach the old result or clean it using the next identity", async () => {
  const scope = await harness("hold"),
    attach = jest.fn();
  const result = scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal });
  const settled = result.then(attach, (error: unknown) => error);
  await scope.entered.promise;
  await scope.manager.signOut();
  await scope.manager.signIn(passwordGrant);
  expect(await settled).toMatchObject({ name: "AbortError" });
  expect(attach).not.toHaveBeenCalled();
  expect(scope.deletes()).toBe(0);
  expect(scope.manager.snapshot().sessionId).toBe("second");
});
test.each(["pending", "badType", "badAuthHeader", "badUrl"] as const)(
  "invalid response %s is refused and cleaned up",
  async (mode) => {
    const scope = await harness(mode);
    await expect(
      scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ key: "invalidUpload" });
    expect(scope.deletes()).toBe(1);
    if (mode === "badAuthHeader" || mode === "badUrl") expect(scope.transferred).toHaveLength(0);
  },
);
test("completion failure never returns an attachable resource", async () => {
  const scope = await harness("incomplete");
  await expect(
    scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ status: 422, errors: [{ code: "file.upload_incomplete" }] });
  expect(scope.deletes()).toBe(1);
});
test("unreachable storage reports a sanitized error without changing the signed path", async () => {
  const scope = await harness("disconnect");
  await expect(
    scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({
    key: "storageUnavailable",
    message: "The operation could not be completed.",
  });
  expect(scope.transferred[0]?.path === "/storage/object?signature=opaque%2Fquery&part=1").toBe(
    true,
  );
  expect(scope.transferred[0]?.auth).toBeUndefined();
});
test("an expired session is cleared before any storage request", async () => {
  const scope = await harness("expired");
  await expect(
    scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(scope.manager.snapshot().status).toBe("anonymous");
  expect(scope.transferred).toHaveLength(0);
});
test("release uploads require HTTPS storage, even if the API returns an HTTP signed URL", async () => {
  const scope = await harness("normal", true);
  await expect(
    scope.uploader.uploadFile(scope.picked, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ key: "invalidUpload" });
  expect(scope.transferred).toHaveLength(0);
});
