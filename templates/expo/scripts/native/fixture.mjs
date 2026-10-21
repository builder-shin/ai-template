import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { nativeLinkFromMail, readMockMailLink } from "../mail-link.ts";

export const fixtureImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
export async function startFixture({
  port,
  api,
  config,
  target,
  mailpit,
  proxy,
  providerOrigin,
  metroOrigin,
  signal,
}) {
  const nonce = randomUUID(),
    suffix = randomUUID().slice(0, 8);
  const data = {
    email: `native-${suffix}@example.com`,
    password: `Native!${randomUUID()}`,
    newPassword: `Reset!${randomUUID()}`,
    name: `Native ${suffix}`,
    title: `Native post ${suffix}`,
    remoteTitle: `Remote post ${suffix}`,
    scheme: config.scheme,
    profileLink: developmentLink(`${config.scheme}://me`),
    sessionsLink: developmentLink(`${config.scheme}://me/sessions`),
    homeLink: developmentLink(`${config.scheme}://`),
  };
  let password = data.password,
    session,
    denyProvider = false,
    holdProvider = false,
    pendingProvider;
  const secrets = [data.password, data.newPassword];
  const diagnostics = [];
  function record(event) {
    if (diagnostics.length === 100) diagnostics.shift();
    diagnostics.push(event);
  }
  function developmentLink(link) {
    if (!metroOrigin) return link;
    const launch = new URL(link);
    launch.searchParams.set("__expo_url", metroOrigin);
    launch.searchParams.set("__expo_disable_onboarding", "1");
    launch.searchParams.set("__expo_disable_auto_launch", "1");
    return launch.toString();
  }
  async function completeProvider(endpoint) {
    const response = await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams(
        denyProvider
          ? { error: "access_denied" }
          : {
              username: `native-${suffix}`,
              claims: JSON.stringify({
                sub: `native-${suffix}`,
                email: `native-${suffix}@gmail.com`,
                email_verified: true,
                name: `OAuth ${suffix}`,
              }),
            },
      ),
    });
    const location = response.headers.get("location");
    if (response.status !== 302 || !location)
      throw new Error("Owned OAuth provider did not redirect.");
    secrets.push(location);
    return location;
  }
  async function jsonRequest(path, method = "GET", body, token) {
    signal?.throwIfAborted();
    const response = await fetch(api + path, {
      method,
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "Accept-Language": "en",
        "User-Agent": "aitpl-native-fixture",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    record({ method, path: new URL(api + path).pathname, status: response.status });
    if (!response.ok) throw new Error(`Native fixture API assertion failed (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  async function token() {
    if (!session) {
      session = (
        await jsonRequest("/sessions", "POST", {
          data: {
            type: "sessions",
            attributes: { grantType: "password", email: data.email, password },
          },
        })
      ).data;
      secrets.push(session.attributes.accessToken, session.attributes.refreshToken);
    }
    return session.attributes.accessToken;
  }
  async function mail(kind) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      try {
        let link;
        if (target === "mock")
          link = await readMockMailLink({
            apiOrigin: new URL(api).origin,
            to: data.email,
            kind,
            config,
          });
        else {
          const list = await (
            await fetch(
              `${mailpit}/api/v1/search?query=${encodeURIComponent("to:" + data.email)}`,
              { signal: AbortSignal.timeout(3000) },
            )
          ).json();
          for (const summary of list.messages ?? []) {
            const message = await (
              await fetch(`${mailpit}/api/v1/message/${encodeURIComponent(summary.ID)}`, {
                signal: AbortSignal.timeout(3000),
              })
            ).json();
            if (!message.To?.some((to) => to.Address?.toLowerCase() === data.email.toLowerCase()))
              continue;
            link = nativeLinkFromMail(message.Text ?? "", kind, config);
            if (link) break;
          }
        }
        if (link) {
          // SDK58 strips reserved development transport params before delivering the original app URI.
          link = developmentLink(link);
          secrets.push(link, new URL(link).searchParams.get("token"));
          return { link };
        }
      } catch {
        /* Only the owned mailbox may still be waiting for its worker. */
      }
      await sleep(200);
    }
    throw new Error("Native fixture mail did not arrive.");
  }
  const actions = {
    data: async () => data,
    "mail-verify": () => mail("verify-email"),
    "mail-reset": () => mail("reset-password"),
    "password-reset": async () => {
      password = data.newPassword;
      session = undefined;
      return { ok: true };
    },
    "inspect-account": async () => {
      const account = await jsonRequest("/me?include=avatar", "GET", undefined, await token());
      return { name: account.data.attributes.name, locale: account.data.attributes.locale };
    },
    "inspect-upload": async () => {
      const account = await jsonRequest("/me?include=avatar", "GET", undefined, await token());
      const id = account.data.relationships.avatar.data?.id;
      const file = account.included?.find((item) => item.type === "files" && item.id === id);
      if (
        !file ||
        file.attributes.status !== "ready" ||
        file.attributes.contentType !== "image/png"
      )
        throw new Error("Native selection did not attach a ready PNG.");
      const response = await fetch(file.meta.downloadUrl, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(fixtureImage))
        throw new Error("Stored native image bytes differ from the selected fixture.");
      return { ok: true, size: fixtureImage.length };
    },
    "inspect-post": async () => {
      const access = await token();
      const account = await jsonRequest("/me", "GET", undefined, access);
      const posts = await jsonRequest(
        `/posts?filter[q]=${encodeURIComponent(data.title)}&filter[author]=${encodeURIComponent(account.data.id)}`,
        "GET",
        undefined,
        access,
      );
      const post = posts.data.find((item) => item.attributes.title === data.title);
      record({
        check: "post-title",
        rows: posts.data.length,
        matched: !!post,
        expectedLength: data.title.length,
        lengths: posts.data.map((item) => item.attributes.title.length),
        caseMatch: posts.data.some(
          (item) => item.attributes.title.toLowerCase() === data.title.toLowerCase(),
        ),
        trimMatch: posts.data.some((item) => item.attributes.title.trim() === data.title),
      });
      if (!post) throw new Error("Native post was not stored.");
      return { status: post.attributes.status, body: post.attributes.body };
    },
    "remote-post": async () => {
      await jsonRequest(
        "/posts",
        "POST",
        {
          data: {
            type: "posts",
            attributes: {
              title: data.remoteTitle,
              body: "Remote native lifecycle event",
              status: "published",
            },
          },
        },
        await token(),
      );
      return { title: data.remoteTitle };
    },
    "revoke-app": async () => {
      await jsonRequest(
        "/session-revocations",
        "POST",
        { data: { type: "session-revocations", attributes: { scope: "others" } } },
        await token(),
      );
      return { ok: true };
    },
    "arm-refresh": async () => {
      proxy.armRefresh();
      return { ok: true };
    },
    "await-refresh": async () => {
      await proxy.waitForRefresh();
      return { count: proxy.refreshCount() };
    },
    "release-refresh": async () => {
      proxy.releaseRefresh();
      return { ok: true };
    },
    "oauth-deny": async () => {
      denyProvider = true;
      return { ok: true };
    },
    "oauth-approve": async () => {
      denyProvider = false;
      return { ok: true };
    },
    "oauth-hold": async () => {
      denyProvider = false;
      holdProvider = true;
      pendingProvider = undefined;
      return { ok: true };
    },
    "await-provider": async () => {
      const deadline = Date.now() + 30000;
      while (!pendingProvider && Date.now() < deadline) await sleep(100);
      if (!pendingProvider) throw new Error("Native provider did not open.");
      return { ok: true };
    },
    "complete-provider": async () => {
      if (!pendingProvider) throw new Error("No owned pending OAuth provider.");
      const endpoint = pendingProvider;
      pendingProvider = undefined;
      holdProvider = false;
      const callback = new URL(await completeProvider(endpoint));
      if (
        callback.origin !== new URL(config.apiBaseUrl).origin ||
        !/^\/api\/v1\/oauth\/(google|kakao|naver)\/callback$/.test(callback.pathname)
      )
        throw new Error("Owned provider returned an unexpected API callback.");
      const response = await fetch(callback, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: { "Accept-Language": "en" },
      });
      const link = response.headers.get("location");
      if (
        response.status !== 302 ||
        !link ||
        !link.startsWith(`${config.scheme}://oauth/callback?`)
      )
        throw new Error("API did not return the native callback.");
      secrets.push(link);
      return { link: developmentLink(link) };
    },
  };
  const server = createServer((req, res) => {
    const action = req.url?.startsWith(`/${nonce}/`) ? req.url.slice(nonce.length + 2) : "";
    if (req.method !== "GET" || !Object.hasOwn(actions, action)) {
      res.writeHead(404).end();
      return;
    }
    void actions[action]()
      .then((result) => {
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify(result));
      })
      .catch(() => {
        record({ action, failed: true });
        res
          .writeHead(500, { "Content-Type": "application/json" })
          .end('{"error":"Native fixture assertion failed"}');
      });
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin,
    url: `${origin}/${nonce}`,
    data,
    secrets,
    diagnostics,
    async seed() {
      await jsonRequest("/registrations", "POST", {
        data: {
          type: "registrations",
          attributes: { email: data.email, password: data.password, name: data.name, locale: "en" },
        },
      });
      const verify = await mail("verify-email");
      await jsonRequest("/email-verifications", "POST", {
        data: {
          type: "email-verifications",
          attributes: { token: new URL(verify.link).searchParams.get("token") },
        },
      });
      await jsonRequest("/password-reset-requests", "POST", {
        data: { type: "password-reset-requests", attributes: { email: data.email } },
      });
      const reset = await mail("reset-password");
      await jsonRequest("/password-resets", "POST", {
        data: {
          type: "password-resets",
          attributes: {
            token: new URL(reset.link).searchParams.get("token"),
            password: data.newPassword,
          },
        },
      });
      await actions["password-reset"]();
    },
    async provider(req, res) {
      const url = new URL(req.url, "http://localhost");
      const match = /^\/(?:_mock|_native)\/oauth\/(google|kakao|naver)\/authorize$/.exec(
        url.pathname,
      );
      if (req.method !== "GET" || !match) return false;
      const endpoint =
        target === "mock"
          ? new URL(req.url, new URL(api).origin)
          : new URL(`/${match[1]}/authorize${url.search}`, providerOrigin);
      if (holdProvider) {
        if (pendingProvider) throw new Error("An OAuth provider is already pending.");
        pendingProvider = endpoint;
        res
          .writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" })
          .end("<title>Native provider ready</title><p>Native provider ready</p>");
        return true;
      }
      const location = await completeProvider(endpoint);
      res.writeHead(302, { Location: location, "Cache-Control": "no-store" }).end();
      return true;
    },
    async stop() {
      proxy?.releaseRefresh();
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
