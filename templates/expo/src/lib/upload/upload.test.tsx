/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { createUploader } from "./core";
import { installNodeHttp, createHttpScope, startMock } from "../testing/native-http";
import type { PickedFile } from "./types";
import type { components } from "../api/generated/schema";
import i18n from "../i18n";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
installNodeHttp();
let server: Awaited<ReturnType<typeof startMock>>;
const scopes: ReturnType<typeof createHttpScope>[] = [];
beforeAll(async () => {
  server = await startMock({ fileUserQuota: 16 });
}, 20000);
afterEach(async () => {
  jest.restoreAllMocks();
  for (const scope of scopes.splice(0)) await scope.dispose();
});
afterAll(async () => {
  await server?.stop();
});
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const picked: PickedFile = {
  uri: "file:///cache/image.png",
  name: "image.png",
  mimeType: "image/png",
  size: bytes.byteLength,
};
async function harness() {
  await i18n.changeLanguage("en");
  const scope = createHttpScope(server.base);
  scopes.push(scope);
  await scope.value.manager.restore();
  await scope.value.manager.signIn({
    grantType: "password",
    email: "admin@example.com",
    password: "admin-password", // betterleaks:allow mock seed
  }); // betterleaks:allow mock seed
  const calls: { url: string; init: RequestInit }[] = [];
  const put = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return fetch(url, init);
  });
  const uploader = createUploader({
    api: scope.value.api,
    session: scope.value.manager,
    prepare: async () => ({ body: bytes, size: bytes.byteLength }),
    put,
  });
  return { scope, put, calls, uploader };
}
test("real mock storage receives the original signed URL, metadata headers and exact bytes, without API credentials", async () => {
  let original: components["schemas"]["FileUpload"] | undefined;
  const request = fetch;
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const response = await request(input, init);
    if (
      input instanceof Request &&
      input.method === "POST" &&
      new URL(input.url).pathname.endsWith("/files")
    ) {
      const document: components["schemas"]["FileDocument"] = await response.clone().json();
      original = document.data.meta?.upload;
    }
    return response;
  });
  const { uploader, calls, scope } = await harness();
  const result = await uploader.uploadFile(picked, { signal: new AbortController().signal });
  expect(result.attributes.status).toBe("ready");
  const call = calls[0]!;
  expect(original).toBeDefined();
  expect(call.url === original!.url).toBe(true);
  expect([...new Headers(call.init.headers)]).toEqual([...new Headers(original!.headers)]);
  expect(call.url).toMatch(/\/_storage\//);
  expect(call.init.method).toBe("PUT");
  expect(call.init.credentials).toBe("omit");
  expect(call.init.redirect).toBe("error");
  const headers = new Headers(call.init.headers);
  expect(headers.get("Content-Type")).toBe("image/png");
  expect(headers.has("Authorization")).toBe(false);
  expect(headers.has("Cookie")).toBe(false);
  try {
    const download = await fetch(result.meta!.downloadUrl!, { redirect: "error" });
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  } finally {
    await scope.value.api.DELETE("/files/{id}", { params: { path: { id: result.id } } });
  }
});
test("local size/type errors and an anonymous session cannot create metadata or PUT", async () => {
  const { uploader, scope, put } = await harness();
  const request = jest.spyOn(globalThis, "fetch");
  await expect(
    uploader.uploadFile({ ...picked, size: 10485761 }, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ key: "fileTooLarge" });
  await expect(
    uploader.uploadFile(
      { ...picked, mimeType: "image/svg+xml" },
      { signal: new AbortController().signal },
    ),
  ).rejects.toMatchObject({ key: "fileTypeNotAllowed" });
  expect(request).not.toHaveBeenCalled();
  await scope.value.manager.signOut();
  await expect(
    uploader.uploadFile(picked, { signal: new AbortController().signal }),
  ).rejects.toMatchObject({ status: 401 });
  expect(put).not.toHaveBeenCalled();
});
test("quota failure stops before storage transfer", async () => {
  const { uploader, scope, put } = await harness();
  const first = await uploader.uploadFile(picked, { signal: new AbortController().signal });
  const second = await uploader.uploadFile(picked, { signal: new AbortController().signal });
  try {
    await expect(
      uploader.uploadFile(picked, { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ status: 422, errors: [{ code: "file.quota_exceeded" }] });
    expect(put).toHaveBeenCalledTimes(2);
  } finally {
    for (const id of [first.id, second.id])
      await scope.value.api.DELETE("/files/{id}", { params: { path: { id } } });
  }
});
