/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { renderRouter, screen, cleanup, act } from "expo-router/testing-library";
import { Stack, router } from "expo-router";
import { Linking, Text } from "react-native";
import { userEvent, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { fetch as nativeFetch } from "expo/fetch";
import { ProfileScreen } from "./profile-screen";
import { AccountApi } from "./api";
import { ProtectedLayout } from "../../lib/session/protected-layout";
import { protectedRouteStubs } from "../../lib/testing/routes";
import { installNodeHttp, startMock, createHttpScope } from "../../lib/testing/native-http";
import { deferred } from "../../lib/session/test-fixtures";
import i18n from "../../lib/i18n";
import { PostsApi, PostsListScreen, PostDetailScreen, PostEditorScreen } from "../posts";
import type { components } from "../../lib/api/generated/schema";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
// Native filesystem/transport ports are replaced; the lifecycle still uses real HTTP and storage bytes.
jest.mock("expo-file-system", () => ({
  File: class extends Uint8Array {
    exists = true;
    size = 8;
    type = "image/png";
    name = "image.png";
    constructor() {
      super([137, 80, 78, 71, 13, 10, 26, 10]);
    }
  },
}));
jest.mock("expo/fetch", () => ({
  fetch: jest.fn((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)),
}));
installNodeHttp();
let server: Awaited<ReturnType<typeof startMock>>, scope: ReturnType<typeof createHttpScope>;
beforeAll(async () => {
  server = await startMock();
}, 20000);
beforeEach(async () => {
  await i18n.changeLanguage("en");
  scope = createHttpScope(server.base);
  await scope.value.manager.restore();
  await scope.value.manager.signIn({
    grantType: "password",
    email: "admin@example.com",
    password: "admin-password", // betterleaks:allow mock seed
  }); // betterleaks:allow test seed
  const api = new AccountApi(scope.value.api),
    me = await api.me();
  await api.update(me.data.id, {
    attributes: { name: "Native User", locale: "en" },
    relationships: { avatar: { data: null } },
  });
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: true, assets: null });
  await renderRouter(
    {
      ...protectedRouteStubs(),
      _layout: () => (
        <scope.Wrapper>
          <Stack screenOptions={{ headerShown: false }} />
        </scope.Wrapper>
      ),
      "(app)/_layout": ProtectedLayout,
      "(app)/me/index": ProfileScreen,
      index: PostsListScreen,
      "posts/[id]": PostDetailScreen,
      "(app)/posts/new": PostEditorScreen,
      "(app)/posts/[id]/edit": PostEditorScreen,
      login: () => <Text>Public login</Text>,
    },
    { initialUrl: "/me" },
  );
  jest.useRealTimers();
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
  await scope?.dispose();
});
afterAll(async () => {
  await server?.stop();
});
test("native profile saves name and locale through the actual account contract", async () => {
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Name");
  await user.clear(name);
  await user.type(name, "Mobile Profile");
  await user.press(screen.getByRole("button", { name: "한국어" }));
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("저장했습니다.")).toBeTruthy();
  const me = await new AccountApi(scope.value.api).me();
  expect(me.data.attributes).toMatchObject({ name: "Mobile Profile", locale: "ko" });
  expect(i18n.language).toBe("ko");
});
test.each(["profile", "post", "post edit"])(
  "a transient refresh failure and retry preserve dirty %s input and session generation",
  async (feature) => {
    const user = userEvent.setup();
    let editingId: string | undefined;
    if (feature === "post edit") {
      const created = await new PostsApi(scope.value.api).create({
        attributes: { title: "Existing edit", body: "Existing body", status: "draft" },
      });
      editingId = created.data.id;
      await act(async () => router.push(`/posts/${editingId}/edit`));
    }
    if (feature === "post") await act(async () => router.push("/posts/new"));
    const label = feature === "profile" ? "Name" : "Title";
    const input = await screen.findByLabelText(label);
    await user.clear(input);
    await user.type(input, "Unsaved native input");
    const manager = scope.value.manager,
      credentials = manager.credentials()!,
      generation = manager.generation(),
      original = globalThis.fetch;
    let failed = false,
      expired = false;
    jest.spyOn(globalThis, "fetch").mockImplementation((request, options) => {
      if (
        editingId &&
        !expired &&
        request instanceof Request &&
        request.method === "GET" &&
        new URL(request.url).pathname === `/api/v1/posts/${editingId}`
      ) {
        expired = true;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              errors: [{ status: "401", code: "auth.access_token_expired", title: "Expired" }],
            }),
            { status: 401, headers: { "Content-Type": "application/vnd.api+json" } },
          ),
        );
      }
      if (
        !failed &&
        request instanceof Request &&
        request.method === "POST" &&
        new URL(request.url).pathname === "/api/v1/sessions"
      ) {
        failed = true;
        return Promise.reject(new TypeError("Owned offline refresh"));
      }
      return original(request, options);
    });
    await act(async () => {
      if (editingId) await scope.queryClient.invalidateQueries();
      else await manager.refresh(credentials);
    });
    expect(failed).toBe(true);
    expect(manager.generation()).toBe(generation);
    expect(manager.snapshot().status).toBe("authenticated");
    expect(screen.getByDisplayValue("Unsaved native input")).toBeTruthy();
    expect(screen.getByText(i18n.t("offline"))).toBeTruthy();
    await user.press(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(manager.snapshot().networkError).toBe(false));
    expect(screen.getByDisplayValue("Unsaved native input")).toBeTruthy();
    expect(manager.generation()).toBe(generation);
    expect(manager.credentials()?.accessToken).not.toBe(credentials.accessToken);
    expect(screen.queryByText(i18n.t("offline"))).toBeNull();
    if (editingId) {
      await user.press(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => {
        const query = scope.queryClient
          .getQueryCache()
          .findAll({ predicate: (item) => item.queryKey.includes(editingId) })[0];
        expect(query?.state.status).toBe("success");
        expect(query?.state.fetchStatus).toBe("idle");
      });
      expect(screen.getByDisplayValue("Unsaved native input")).toBeTruthy();
      expect(manager.generation()).toBe(generation);
    }
  },
);
test("picker cancellation has no transfer; an image is uploaded, attached, downloaded and removed", async () => {
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "Choose image: Avatar" }));
  expect(nativeFetch).not.toHaveBeenCalled();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///cache/image.png", width: 1, height: 1, mimeType: "image/png", fileSize: 8 },
    ],
  });
  await user.press(screen.getByRole("button", { name: "Choose image: Avatar" }));
  expect(await screen.findByRole("image", { name: "Avatar" })).toBeTruthy();
  const api = new AccountApi(scope.value.api),
    me = await api.me();
  const id = me.data.relationships.avatar.data!.id;
  const file = me.included?.find((item) => item.type === "files" && item.id === id);
  expect(file?.type).toBe("files");
  if (file?.type !== "files") throw new Error("Missing avatar resource.");
  const download = await fetch(file.meta!.downloadUrl!);
  expect(new Uint8Array(await download.arrayBuffer())).toEqual(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await user.press(screen.getByRole("button", { name: "Remove image: Avatar" }));
  expect(await screen.findByText("No image selected.")).toBeTruthy();
  expect((await api.me()).data.relationships.avatar.data).toBeNull();
});
test("permission denial offers system settings without an API upload", async () => {
  const settings = deferred<void>();
  const open = jest.spyOn(Linking, "openSettings").mockReturnValue(settings.promise);
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockRejectedValueOnce({ code: "ERR_MISSING_PERMISSION" });
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "Choose image: Avatar" }));
  expect(
    await screen.findByText("Allow photo access in system settings, then retry."),
  ).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Open settings" }));
  expect(open).toHaveBeenCalledTimes(1);
  try {
    expect(screen.queryByRole("button", { name: "Cancel upload" })).toBeNull();
  } finally {
    await act(async () => {
      settings.resolve();
    });
  }
  expect(nativeFetch).not.toHaveBeenCalled();
});
test("a late upload result cannot attach after logout and a new session", async () => {
  const entered = deferred<void>(),
    held = deferred<void>(),
    transferred = deferred<void>();
  const transport = jest.mocked(nativeFetch).getMockImplementation();
  if (!transport) throw new Error("Missing test transport.");
  jest.mocked(nativeFetch).mockImplementationOnce(async (input, init) => {
    entered.resolve();
    await held.promise;
    // Model a native transport that completes despite cancellation; core must still fence its result.
    const { signal, ...uninterrupted } = init ?? {};
    void signal;
    try {
      return await transport(input, uninterrupted);
    } finally {
      transferred.resolve();
    }
  });
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: "file:///cache/image.png", width: 1, height: 1 }],
  });
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "Choose image: Avatar" }));
  await entered.promise;
  await act(async () => {
    await scope.value.manager.signOut();
    await scope.value.manager.signIn({
      grantType: "password",
      email: "admin@example.com",
      password: "admin-password", // betterleaks:allow mock seed
    });
  }); // betterleaks:allow test seed
  await act(async () => {
    held.resolve();
    await transferred.promise;
    await Promise.resolve();
  });
  expect((await new AccountApi(scope.value.api).me()).data.relationships.avatar.data).toBeNull();
});
test("native post cover is uploaded, attached on save and released on remove", async () => {
  await act(async () => {
    router.push("/posts/new");
  });
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Title"), "Native cover post");
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: "file:///cache/image.png", width: 1, height: 1 }],
  });
  await user.press(screen.getByRole("button", { name: "Choose image: Cover image" }));
  expect(await screen.findByRole("image", { name: "Cover image" })).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("button", { name: "Publish" })).toBeTruthy();
  const owner = (await new AccountApi(scope.value.api).me()).data.id,
    api = new PostsApi(scope.value.api);
  const post = (await api.list({ author: owner, q: "Native cover post" })).data[0]!;
  const id = post.relationships.coverImage.data!.id;
  await user.press(screen.getByRole("button", { name: "Edit" }));
  await user.press(await screen.findByRole("button", { name: "Remove image: Cover image" }));
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("button", { name: "Publish" })).toBeTruthy();
  expect((await api.get(post.id)).data.relationships.coverImage.data).toBeNull();
  await expect(
    scope.value.api.GET("/files/{id}", { params: { path: { id } } }),
  ).rejects.toMatchObject({ status: 404 });
  await api.remove(post.id);
}, 15000);
test("cancelling an unsaved cover deletes only its newly uploaded file", async () => {
  let createdId: string | undefined;
  const transport = fetch;
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const response = await transport(input, init);
    if (
      input instanceof Request &&
      input.method === "POST" &&
      new URL(input.url).pathname.endsWith("/files") &&
      response.ok
    ) {
      const document: components["schemas"]["FileDocument"] = await response.clone().json();
      createdId = document.data.id;
    }
    return response;
  });
  await act(async () => {
    router.push("/posts/new");
  });
  const user = userEvent.setup();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: "file:///cache/image.png", width: 1, height: 1 }],
  });
  await user.press(await screen.findByRole("button", { name: "Choose image: Cover image" }));
  expect(await screen.findByRole("image", { name: "Cover image" })).toBeTruthy();
  expect(createdId).toBeDefined();
  await user.press(screen.getByRole("button", { name: "Cancel" }));
  await screen.findByRole("button", { name: "New post" });
  // The screen's cleanup is asynchronous; observe the real backend deletion before teardown.
  const deadline = Date.now() + 2000;
  let removed = false;
  await act(async () => {
    while (Date.now() < deadline) {
      try {
        await scope.value.api.GET("/files/{id}", { params: { path: { id: createdId! } } });
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 404) {
          removed = true;
          break;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  expect(removed).toBe(true);
}, 15000);
