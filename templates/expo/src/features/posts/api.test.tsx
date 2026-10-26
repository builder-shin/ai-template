/** @jest-environment ./scripts/test/node-http-environment.cjs */
import { PostsApi } from "./api";
import { authorLabel } from "./queries";
import { installNodeHttp, startMock, createHttpScope } from "../../lib/testing/native-http";
import { AuthApi } from "../auth";
import { AccountApi } from "../account";
import { readMockMailLink } from "../../../scripts/mail-link";
import { renderRouter, screen, cleanup, act, waitFor } from "expo-router/testing-library";
import { Stack } from "expo-router";
import { userEvent } from "@testing-library/react-native";
import { PostsListScreen } from "./list-screen";
import { PostDetailScreen } from "./detail-screen";
import { PostEditorScreen } from "./editor-screen";
import { ProtectedLayout } from "../../lib/session/protected-layout";
import i18n from "../../lib/i18n";
import { protectedRouteStubs } from "../../lib/testing/routes";
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
installNodeHttp();
let server: Awaited<ReturnType<typeof startMock>>;
const scopes: ReturnType<typeof createHttpScope>[] = [];
beforeAll(async () => {
  server = await startMock();
}, 20000);
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
  for (const scope of scopes.splice(0)) await scope.dispose();
});
afterAll(async () => {
  await server?.stop();
});
async function admin() {
  const scope = createHttpScope(server.base);
  scopes.push(scope);
  await scope.value.manager.restore();
  await scope.value.manager.signIn({
    grantType: "password",
    email: "admin@example.com",
    password: "admin-password", // betterleaks:allow mock seed
  }); // betterleaks:allow mock seed
  return scope;
}
test("real HTTP public/own visibility, paging, relationships, status transitions and unauthorized writes", async () => {
  await i18n.changeLanguage("en");
  const scope = await admin(),
    api = new PostsApi(scope.value.api);
  await expect(api.create({ attributes: { title: "", body: "" } })).rejects.toMatchObject({
    status: 422,
  });
  await expect(
    api.create({ attributes: { title: "x".repeat(201), body: "" } }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    api.create({ attributes: { title: "ok", body: "x".repeat(100001) } }),
  ).rejects.toMatchObject({ status: 422 });
  const anonymous = createHttpScope(server.base);
  scopes.push(anonymous);
  await anonymous.value.manager.restore();
  const publicApi = new PostsApi(anonymous.value.api);
  const draft = await api.create({
    attributes: { title: "Owned draft", body: "Body", status: "draft" },
  });
  const owner = (await new AccountApi(scope.value.api).me()).data.id;
  expect((await publicApi.list({})).data.some((item) => item.id === draft.data.id)).toBe(false);
  expect((await api.list({ author: owner })).data.some((item) => item.id === draft.data.id)).toBe(
    true,
  );
  await expect(publicApi.get(draft.data.id)).rejects.toMatchObject({ status: 404 });
  await api.update(draft.data.id, { attributes: { status: "published" } });
  const document = await publicApi.get(draft.data.id);
  expect(document.data.attributes.publishedAt).not.toBeNull();
  expect(authorLabel(document.data, document.included, "Unknown")).not.toBe("Unknown");
  const second = await api.create({
    attributes: { title: "Second published", body: "", status: "published" },
  });
  let page = 1;
  const seen: string[] = [];
  while (true) {
    const result = await publicApi.list({ author: owner, page, size: 1 });
    seen.push(...result.data.map((item) => item.id));
    if (!result.links.next) break;
    expect(page++).toBeLessThan(10);
  }
  expect(seen).toEqual(expect.arrayContaining([draft.data.id, second.data.id]));
  const outsider = createHttpScope(server.base);
  scopes.push(outsider);
  await outsider.value.manager.restore();
  const auth = new AuthApi(outsider.value.api),
    email = "post-outsider@example.com";
  const password = "outsider-password"; // betterleaks:allow test password
  await auth.register({ email, name: "Outsider", password });
  const link = await readMockMailLink({
    apiOrigin: server.base,
    to: email,
    kind: "verify-email",
    config: outsider.value.config,
  });
  await auth.verify(new URL(link).searchParams.get("token")!);
  await outsider.value.manager.signIn({ grantType: "password", email, password });
  await expect(
    new PostsApi(outsider.value.api).update(draft.data.id, { attributes: { title: "Stolen" } }),
  ).rejects.toMatchObject({ status: 403 });
  await api.update(draft.data.id, { attributes: { status: "draft" } });
  await expect(publicApi.get(draft.data.id)).rejects.toMatchObject({ status: 404 });
  await api.remove(draft.data.id);
  await expect(api.update(draft.data.id, { attributes: { title: "Stale" } })).rejects.toMatchObject(
    { status: 404 },
  );
  await api.remove(second.data.id);
});
test("native Router creates, publishes, edits, unpublishes and deletes against real HTTP", async () => {
  await i18n.changeLanguage("en");
  const scope = await admin();
  await renderRouter(
    {
      ...protectedRouteStubs(),
      _layout: () => (
        <scope.Wrapper>
          <Stack screenOptions={{ headerShown: false }} />
        </scope.Wrapper>
      ),
      index: PostsListScreen,
      "posts/[id]": PostDetailScreen,
      "(app)/_layout": ProtectedLayout,
      "(app)/posts/new": PostEditorScreen,
      "(app)/posts/[id]/edit": PostEditorScreen,
    },
    { initialUrl: "/" },
  );
  jest.useRealTimers();
  const user = userEvent.setup();
  await user.press(await screen.findByRole("button", { name: "New post" }));
  await user.type(await screen.findByLabelText("Title"), "Native CRUD title");
  await user.type(screen.getByLabelText("Body"), "Native CRUD body");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Native CRUD title")).toBeTruthy();
  await user.press(await screen.findByRole("button", { name: "Publish" }));
  expect(await screen.findByRole("button", { name: "Unpublish" })).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Edit" }));
  const title = await screen.findByLabelText("Title");
  await user.clear(title);
  await user.type(title, "Native edited title");
  await user.press(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Native edited title")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Unpublish" }));
  expect(await screen.findByRole("button", { name: "Publish" })).toBeTruthy();
  await act(async () => {
    await scope.value.manager.signOut();
  });
  await waitFor(() => {
    expect(screen.queryByText("Native edited title")).toBeNull();
  });
  await act(async () => {
    await scope.value.manager.signIn({
      grantType: "password",
      email: "admin@example.com",
      password: "admin-password", // betterleaks:allow mock seed
    });
  }); // betterleaks:allow mock seed
  expect(await screen.findByText("Native edited title")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: "Delete" }));
  await user.press(await screen.findByRole("button", { name: "Confirm" }));
  expect(await screen.findByRole("button", { name: "New post" })).toBeTruthy();
  expect(screen.queryByText("Native edited title")).toBeNull();
}, 15000);
